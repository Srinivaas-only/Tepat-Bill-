// Flag detection pipeline: DB rows -> core detectFlags -> flag rows. All money logic stays in shared/core.
import { and, eq, inArray, isNull, ne } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { randomBytes } from 'node:crypto';
import * as S from '../shared/schema';
import { autofillPriceList, baseline, detectFlags, matchLine, normalise, type DetectedFlag, type InvLine, type PoLine, type PriceList } from '../shared/core';
import type { Db } from './db';
import { aliasTableFromRows, cleanPriceList, detectedToRow, invLineRowToCore, nearSku, poLineRowToCore, priceListFromRows, slug } from './core-adapters';

type Conn = Pick<Db, 'select' | 'insert' | 'update' | 'delete'>;

export interface InvoiceContext {
  inv: typeof S.invoices.$inferSelect;
  lines: (typeof S.invoiceLines.$inferSelect)[];
  invLines: InvLine[];
  po: PoLine[];
  implicitPo: boolean;
  poRow?: typeof S.purchaseOrders.$inferSelect;
  aliases: ReturnType<typeof aliasTableFromRows>;
  priceNow: PriceList;
  saved: Record<string, number>;
  savedSources: Record<string, string>;
}

export async function loadContext(db: Conn, invoiceId: string): Promise<InvoiceContext | null> {
  const [inv] = await db.select().from(S.invoices).where(eq(S.invoices.id, invoiceId));
  if (!inv) return null;
  const lines = await db.select().from(S.invoiceLines).where(eq(S.invoiceLines.invoiceId, invoiceId)).orderBy(S.invoiceLines.position);
  const invLines = lines.map(invLineRowToCore);
  let po: PoLine[] = []; let poRow;
  if (inv.poId) {
    [poRow] = await db.select().from(S.purchaseOrders).where(eq(S.purchaseOrders.id, inv.poId));
    po = (await db.select().from(S.poLines).where(eq(S.poLines.poId, inv.poId)).orderBy(S.poLines.position)).map(poLineRowToCore);
  }
  const implicit = !inv.poId;
  // no PO ("Tiada PO"): implicit PO built from the invoice lines so not_ordered cannot fire for the whole bill (notes 17)
  const aliases = aliasTableFromRows(await db.select().from(S.aliases).where(eq(S.aliases.supplierId, inv.supplierId)));
  const priceNow = priceListFromRows(await db.select().from(S.priceList).where(eq(S.priceList.supplierId, inv.supplierId)));
  if (implicit) {
    const known = Object.keys(priceNow);
    const used = new Set<string>();
    po = invLines.map(l => {
      const aliased = aliases[inv.supplierId]?.[normalise(l.description)];
      let sku = aliased ?? nearSku(l.description, known, used) ?? slug(l.description);
      if (used.has(sku)) sku = slug(l.description);
      used.add(sku);
      return { sku, description: l.description, orderedQty: l.qty };
    });
  }
  const savedRows = await db.select().from(S.receivedCounts).where(eq(S.receivedCounts.invoiceId, invoiceId));
  // ONE quantity record: a count stored under a matched PO sku (`<sku>`) is the count of that invoice line, so it is read as `line:<id>`.
  // (Otherwise the billed-qty default for `line:<id>` wins and shows "48 received" next to a "6 missing" flag.)
  const saved: Record<string, number> = {}, savedSources: Record<string, string> = {};
  for (const r of savedRows) if (r.key.startsWith('line:')) { saved[r.key] = r.qty; savedSources[r.key] = r.source; }
  for (const r of savedRows) {
    if (r.key.startsWith('line:')) continue;
    const l = invLines.find(x => matchLine(inv.supplierId, x, po, aliases)?.sku === r.key);
    const k = l ? `line:${l.lineId}` : r.key;
    if (l && k in saved) continue;
    saved[k] = r.qty; savedSources[k] = r.source;
  }
  return { inv, lines, invLines, po, implicitPo: implicit, poRow, aliases, priceNow, saved, savedSources };
}

/** Notes 13: defaults = each matched invoice line -> its invoice qty; each PO-only sku -> 0. Body counts merge over the top. */
export function defaultCounts(c: Pick<InvoiceContext, 'inv' | 'invLines' | 'po' | 'aliases'>): Record<string, number> {
  const out: Record<string, number> = {};
  const matched = new Set<string>();
  for (const l of c.invLines) {
    const m = matchLine(c.inv.supplierId, l, c.po, c.aliases);
    if (m) { matched.add(m.sku); out[`line:${l.lineId}`] = l.qty; }
  }
  for (const p of c.po) if (!matched.has(p.sku)) out[p.sku] = 0;
  return out;
}

export const snapshotOf = (c: InvoiceContext): PriceList => (c.inv.priceListSnapshot as PriceList | null) ?? c.priceNow;

export function runDetection(c: InvoiceContext, counts: Record<string, number>, snapshot: PriceList): DetectedFlag[] {
  return detectFlags({ supplierId: c.inv.supplierId, po: c.po, invoice: c.invLines, received: counts, priceList: snapshot, aliases: c.aliases });
}

/**
 * Sync proposed flags with the new detection. A proposed row with the same (line, type) is UPDATED in place so its id and evidence token
 * stay stable (open /flags/:id pages keep working); new ones are inserted; proposed rows that no longer match are deleted.
 * Flags with status != proposed are untouched. Attach photos.
 */
export async function replaceProposedFlags(db: Conn, c: InvoiceContext, detected: DetectedFlag[]) {
  const existing = await db.select().from(S.flags).where(eq(S.flags.invoiceId, c.inv.id));
  const keyOf = (line: string, type: string) => `${line}:${type}`;
  const kept = new Set(existing.filter(f => f.status !== 'proposed').map(f => keyOf(f.invoiceLineId, f.type)));
  const proposed = new Map(existing.filter(f => f.status === 'proposed').map(f => [keyOf(f.invoiceLineId, f.type), f]));
  const inserts: ReturnType<typeof detectedToRow>[] = [];
  const matched = new Set<string>();
  for (const d of detected) {
    const k = keyOf(d.invoiceLineId, d.type);
    if (kept.has(k)) continue;
    const row = detectedToRow(d, { id: `flg_${nanoid(10)}`, token: randomBytes(16).toString('hex'), supplierId: c.inv.supplierId, invoiceId: c.inv.id, poId: c.inv.poId });
    const old = proposed.get(k);
    if (old) {
      matched.add(k);
      const { id: _i, evidenceToken: _t, supplierId: _s, invoiceId: _v, ...patch } = row;
      await db.update(S.flags).set(patch).where(and(eq(S.flags.id, old.id), eq(S.flags.status, 'proposed')));
    } else inserts.push(row);
  }
  const staleIds = [...proposed.entries()].filter(([k]) => !matched.has(k)).map(([, f]) => f.id);
  if (staleIds.length) {
    const gone = await db.delete(S.flags).where(and(inArray(S.flags.id, staleIds), eq(S.flags.status, 'proposed'))).returning({ id: S.flags.id });
    if (gone.length) await db.delete(S.flagPhotos).where(inArray(S.flagPhotos.flagId, gone.map(g => g.id)));
  }
  if (inserts.length) await db.insert(S.flags).values(inserts);
  await attachPhotos(db, c);
}

/** Notes 21: each flag gets the invoice document + the PO document + count-screen photos for that invoice + the linked delivery's bon and photos. */
export async function attachPhotos(db: Conn, c: Pick<InvoiceContext, 'inv' | 'poRow'>) {
  const flags = await db.select({ id: S.flags.id }).from(S.flags).where(eq(S.flags.invoiceId, c.inv.id));
  if (!flags.length) return;
  const extra = await db.select({ id: S.documents.id }).from(S.documents).where(and(eq(S.documents.invoiceId, c.inv.id), ne(S.documents.kind, 'invoice')));
  // the delivery this invoice was compared with: its signed bon, delivery photos and any other uploads back the complaint
  const [del] = await db.select({ id: S.deliveries.id, documentId: S.deliveries.documentId }).from(S.deliveries).where(eq(S.deliveries.invoiceId, c.inv.id));
  const delDocs = del ? await db.select({ id: S.documents.id }).from(S.documents).where(eq(S.documents.deliveryId, del.id)) : [];
  const ids = [c.inv.documentId, c.poRow?.documentId, ...extra.map(e => e.id), del?.documentId, ...delDocs.map(e => e.id)].filter((x): x is string => !!x);
  const unique = [...new Set(ids)];
  if (!unique.length) return;
  await db.insert(S.flagPhotos).values(flags.flatMap(f => unique.map(d => ({ flagId: f.id, documentId: d })))).onConflictDoNothing();
}

/** First save only: autofill last_invoice prices from the matched lines, skipping skus with an upward price flag (core rule). */
export async function firstSaveAutofill(db: Conn, c: InvoiceContext, detected: DetectedFlag[]) {
  const skip = new Set(detected.filter(d => d.type === 'price_change' && d.direction !== 'down' && d.sku).map(d => d.sku!));
  const open = await db.select({ sku: S.flags.sku }).from(S.flags)
    .where(and(eq(S.flags.supplierId, c.inv.supplierId), eq(S.flags.type, 'price_change'), eq(S.flags.direction, 'up'), inArray(S.flags.status, ['proposed', 'open', 'disputed'])));
  for (const o of open) if (o.sku) skip.add(o.sku);
  const lines = c.invLines.flatMap(l => {
    const m = matchLine(c.inv.supplierId, l, c.po, c.aliases);
    if (m) { const b = baseline(c.priceNow[m.sku], m); if (b && l.unitPriceSen > b.sen) skip.add(m.sku); }   // a rise is never adopted silently, even when nothing was received (so no flag was raised)
    return m ? [{ sku: m.sku, unitPriceSen: l.unitPriceSen }] : [];
  });
  const next = cleanPriceList(autofillPriceList(c.priceNow, lines, skip));
  for (const l of lines) {
    if (skip.has(l.sku)) continue;
    const e = next[l.sku];
    await db.insert(S.priceList).values({ supplierId: c.inv.supplierId, sku: l.sku, lastInvoiceSen: e.lastInvoiceSen ?? null, agreedSen: e.agreedSen ?? null })
      .onConflictDoUpdate({ target: [S.priceList.supplierId, S.priceList.sku], set: { lastInvoiceSen: e.lastInvoiceSen ?? null } });
  }
}

/**
 * After counts change: approved/open/disputed/settled invoice flags are never rewritten silently. Any whose line/type no longer
 * matches the fresh detection (gone, or different missing qty / amount) is marked needsRecheck for the owner; matching ones are cleared.
 * Returns how many flags now need a recheck.
 */
export async function markStaleFlags(db: Conn, invoiceId: string, detected: DetectedFlag[]): Promise<number> {
  const rows = await db.select().from(S.flags).where(and(eq(S.flags.invoiceId, invoiceId), eq(S.flags.stage, 'invoice'), ne(S.flags.status, 'proposed'), ne(S.flags.status, 'dismissed'), isNull(S.flags.supersededBy)));
  let stale = 0;
  for (const f of rows) {
    const d = detected.find(x => x.invoiceLineId === f.invoiceLineId && x.type === f.type);
    // a higher claim than the flag holds needs a recheck; a LOWER one is the foreign-line clamp on a pre-existing flag, not a change of facts
    const differs = !d || (d.missingQty ?? null) !== (f.missingQty ?? null) || (f.type === 'price_change' ? d.amountSen !== f.amountSen : d.amountSen > f.amountSen);
    if (differs) stale++;
    if (differs !== f.needsRecheck) await db.update(S.flags).set({ needsRecheck: differs }).where(eq(S.flags.id, f.id));
  }
  return stale;
}

/** True when an invoice's counts are already relied on: owner approved, paid, or a live (open/disputed/settled) complaint. */
export async function invoiceCountsGuarded(db: Conn, inv: { id: string; ownerMarkedCorrect: boolean; payment: string }): Promise<boolean> {
  if (inv.ownerMarkedCorrect || inv.payment === 'paid') return true;
  const live = await db.select({ id: S.flags.id }).from(S.flags).where(and(eq(S.flags.invoiceId, inv.id), eq(S.flags.stage, 'invoice'), isNull(S.flags.supersededBy), inArray(S.flags.status, ['open', 'disputed', 'settled']))).limit(1);
  return live.length > 0;
}

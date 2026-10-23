// Flag detection pipeline: DB rows -> core detectFlags -> flag rows. All money logic stays in shared/core.
import { and, eq, inArray, ne } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { randomBytes } from 'node:crypto';
import * as S from '../shared/schema';
import { autofillPriceList, detectFlags, matchLine, type DetectedFlag, type InvLine, type PoLine, type PriceList } from '../shared/core';
import type { Db } from './db';
import { aliasTableFromRows, cleanPriceList, detectedToRow, invLineRowToCore, poLineRowToCore, priceListFromRows, slug } from './core-adapters';

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
  if (implicit) po = invLines.map(l => ({ sku: slug(l.description), description: l.description, orderedQty: l.qty }));
  const aliases = aliasTableFromRows(await db.select().from(S.aliases).where(eq(S.aliases.supplierId, inv.supplierId)));
  const priceNow = priceListFromRows(await db.select().from(S.priceList).where(eq(S.priceList.supplierId, inv.supplierId)));
  const savedRows = await db.select().from(S.receivedCounts).where(eq(S.receivedCounts.invoiceId, invoiceId));
  return { inv, lines, invLines, po, implicitPo: implicit, poRow, aliases, priceNow, saved: Object.fromEntries(savedRows.map(r => [r.key, r.qty])) };
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

/** Replace proposed flags with the new detection; keep flags whose (line,type) already exists with status != proposed. Attach photos. */
export async function replaceProposedFlags(db: Conn, c: InvoiceContext, detected: DetectedFlag[]) {
  const existing = await db.select().from(S.flags).where(eq(S.flags.invoiceId, c.inv.id));
  const kept = new Set(existing.filter(f => f.status !== 'proposed').map(f => `${f.invoiceLineId}:${f.type}`));
  const proposedIds = existing.filter(f => f.status === 'proposed').map(f => f.id);
  if (proposedIds.length) {
    await db.delete(S.flagPhotos).where(inArray(S.flagPhotos.flagId, proposedIds));
    await db.delete(S.flags).where(inArray(S.flags.id, proposedIds));
  }
  const fresh = detected.filter(d => !kept.has(`${d.invoiceLineId}:${d.type}`));
  if (fresh.length) {
    await db.insert(S.flags).values(fresh.map(d => detectedToRow(d, {
      id: `flg_${nanoid(10)}`, token: randomBytes(16).toString('hex'), supplierId: c.inv.supplierId, invoiceId: c.inv.id, poId: c.inv.poId,
    })));
  }
  await attachPhotos(db, c);
}

/** Notes 21: each flag gets the invoice document + the PO document + count-screen photos for that invoice. */
export async function attachPhotos(db: Conn, c: Pick<InvoiceContext, 'inv' | 'poRow'>) {
  const flags = await db.select({ id: S.flags.id }).from(S.flags).where(eq(S.flags.invoiceId, c.inv.id));
  if (!flags.length) return;
  const extra = await db.select({ id: S.documents.id }).from(S.documents).where(and(eq(S.documents.invoiceId, c.inv.id), ne(S.documents.kind, 'invoice')));
  const ids = [c.inv.documentId, c.poRow?.documentId, ...extra.map(e => e.id)].filter((x): x is string => !!x);
  const unique = [...new Set(ids)];
  if (!unique.length) return;
  await db.insert(S.flagPhotos).values(flags.flatMap(f => unique.map(d => ({ flagId: f.id, documentId: d })))).onConflictDoNothing();
}

/** First save only: autofill last_invoice prices from the matched lines, skipping skus with an upward price flag (core rule). */
export async function firstSaveAutofill(db: Conn, c: InvoiceContext, detected: DetectedFlag[]) {
  const skip = new Set(detected.filter(d => d.type === 'price_change' && d.direction === 'up' && d.sku).map(d => d.sku!));
  const lines = c.invLines.flatMap(l => {
    const m = matchLine(c.inv.supplierId, l, c.po, c.aliases);
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

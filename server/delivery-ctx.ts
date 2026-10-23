// Delivery-stage pipeline (bon/DO checked when the goods arrive). Mirrors server/flags.ts; all rules live in shared/core/delivery.ts.
import { and, eq, inArray, isNull } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { randomBytes } from 'node:crypto';
import * as S from '../shared/schema';
import { checkDelivery, normalise, type DeliveryLine, type DetectedFlag, type PoLine } from '../shared/core';
import type { Db } from './db';
import { aliasTableFromRows, detectedToRow, nearSku, poLineRowToCore, priceListFromRows, slug } from './core-adapters';

type Conn = Pick<Db, 'select' | 'insert' | 'update' | 'delete'>;

export interface DeliveryContext {
  del: typeof S.deliveries.$inferSelect;
  lines: (typeof S.deliveryLines.$inferSelect)[];
  delLines: DeliveryLine[];
  po: PoLine[];
  implicitPo: boolean;
  poRow?: typeof S.purchaseOrders.$inferSelect;
  aliases: ReturnType<typeof aliasTableFromRows>;
  priceNow: ReturnType<typeof priceListFromRows>;
  saved: Record<string, number>;
}

export async function loadDeliveryContext(db: Conn, deliveryId: string): Promise<DeliveryContext | null> {
  const [del] = await db.select().from(S.deliveries).where(eq(S.deliveries.id, deliveryId));
  if (!del) return null;
  const lines = await db.select().from(S.deliveryLines).where(eq(S.deliveryLines.deliveryId, deliveryId)).orderBy(S.deliveryLines.position);
  const delLines: DeliveryLine[] = lines.map(l => ({ lineId: l.lineId, description: l.description, qty: l.qty, box: (l.box ?? undefined) as DeliveryLine['box'] }));
  let po: PoLine[] = []; let poRow;
  if (del.poId) {
    [poRow] = await db.select().from(S.purchaseOrders).where(eq(S.purchaseOrders.id, del.poId));
    po = (await db.select().from(S.poLines).where(eq(S.poLines.poId, del.poId)).orderBy(S.poLines.position)).map(poLineRowToCore);
  }
  const aliases = aliasTableFromRows(await db.select().from(S.aliases).where(eq(S.aliases.supplierId, del.supplierId)));
  const priceNow = priceListFromRows(await db.select().from(S.priceList).where(eq(S.priceList.supplierId, del.supplierId)));
  const implicit = !del.poId;
  if (implicit) {
    // no PO: implicit PO from the bon lines so not_ordered cannot fire for the whole delivery (same rule as invoices)
    const known = Object.keys(priceNow);
    const used = new Set<string>();
    po = delLines.map(l => {
      let sku = aliases[del.supplierId]?.[normalise(l.description)] ?? nearSku(l.description, known, used) ?? slug(l.description);
      if (used.has(sku)) sku = slug(l.description);
      used.add(sku);
      return { sku, description: l.description, orderedQty: l.qty };
    });
  }
  const savedRows = await db.select().from(S.deliveryCounts).where(eq(S.deliveryCounts.deliveryId, deliveryId));
  return { del, lines, delLines, po, implicitPo: implicit, poRow, aliases, priceNow, saved: Object.fromEntries(savedRows.map(r => [r.key, r.qty])) };
}

/** Every delivery line defaults to the delivered qty. */
export const defaultDeliveryCounts = (c: Pick<DeliveryContext, 'delLines'>): Record<string, number> =>
  Object.fromEntries(c.delLines.map(l => [`line:${l.lineId}`, l.qty]));

export const runDeliveryCheck = (c: DeliveryContext, counts: Record<string, number>): DetectedFlag[] =>
  checkDelivery({ supplierId: c.del.supplierId, po: c.po, lines: c.delLines, received: counts, priceList: c.priceNow, aliases: c.aliases });

/** Same in-place sync as replaceProposedFlags, scoped to this delivery's PROPOSED delivery-stage flags. */
export async function replaceProposedDeliveryFlags(db: Conn, c: DeliveryContext, detected: DetectedFlag[]) {
  const existing = await db.select().from(S.flags).where(and(eq(S.flags.deliveryId, c.del.id), eq(S.flags.stage, 'delivery')));
  const keyOf = (line: string, type: string) => `${line}:${type}`;
  const kept = new Set(existing.filter(f => f.status !== 'proposed').map(f => keyOf(f.invoiceLineId, f.type)));
  const proposed = new Map(existing.filter(f => f.status === 'proposed').map(f => [keyOf(f.invoiceLineId, f.type), f]));
  const inserts: ReturnType<typeof detectedToRow>[] = [];
  const matched = new Set<string>();
  for (const d of detected) {
    const k = keyOf(d.invoiceLineId, d.type);
    if (kept.has(k)) continue;
    const row = detectedToRow(d, { id: `flg_${nanoid(10)}`, token: randomBytes(16).toString('hex'), supplierId: c.del.supplierId, invoiceId: null, poId: c.del.poId, stage: 'delivery', deliveryId: c.del.id });
    const old = proposed.get(k);
    if (old) {
      matched.add(k);
      const { id: _i, evidenceToken: _t, supplierId: _s, invoiceId: _v, stage: _st, deliveryId: _d, ...patch } = row;
      await db.update(S.flags).set(patch).where(eq(S.flags.id, old.id));
    } else inserts.push(row);
  }
  const staleIds = [...proposed.entries()].filter(([k]) => !matched.has(k)).map(([, f]) => f.id);
  if (staleIds.length) {
    await db.delete(S.flagPhotos).where(inArray(S.flagPhotos.flagId, staleIds));
    await db.delete(S.flags).where(inArray(S.flags.id, staleIds));
  }
  if (inserts.length) await db.insert(S.flags).values(inserts);
  await attachDeliveryPhotos(db, c);
}

/** Each delivery flag gets the bon document + the PO document + photos uploaded for this delivery. */
export async function attachDeliveryPhotos(db: Conn, c: Pick<DeliveryContext, 'del' | 'poRow'>) {
  const flags = await db.select({ id: S.flags.id }).from(S.flags).where(and(eq(S.flags.deliveryId, c.del.id), eq(S.flags.stage, 'delivery')));
  if (!flags.length) return;
  const extra = await db.select({ id: S.documents.id }).from(S.documents).where(eq(S.documents.deliveryId, c.del.id));
  const ids = [c.del.documentId, c.poRow?.documentId, ...extra.map(e => e.id)].filter((x): x is string => !!x);
  const unique = [...new Set(ids)];
  if (!unique.length) return;
  await db.insert(S.flagPhotos).values(flags.flatMap(f => unique.map(d => ({ flagId: f.id, documentId: d })))).onConflictDoNothing();
}

/**
 * A new invoice-stage short_qty flag takes over the delivery-stage short_qty flag of the same sku in the linked delivery.
 * Proposed delivery flags become dismissed; open ones stay open (superseded_by hides them from the work lists).
 * Delivery flags already settled stay exactly as they are (the goods may have been redelivered).
 */
export async function supersedeDeliveryFlags(db: Conn, deliveryId: string, newInvoiceFlags: { id: string; type: string; sku: string | null }[]) {
  const shorts = newInvoiceFlags.filter(f => f.type === 'short_qty' && f.sku);
  if (!shorts.length) return;
  const open = await db.select().from(S.flags).where(and(eq(S.flags.deliveryId, deliveryId), eq(S.flags.stage, 'delivery'), eq(S.flags.type, 'short_qty'),
    inArray(S.flags.status, ['proposed', 'open', 'disputed']), isNull(S.flags.supersededBy)));
  for (const d of open) {
    const by = shorts.find(f => f.sku === d.sku);
    if (!by) continue;
    await db.update(S.flags).set({ supersededBy: by.id, ...(d.status === 'proposed' ? { status: 'dismissed' } : {}) }).where(eq(S.flags.id, d.id));
  }
}

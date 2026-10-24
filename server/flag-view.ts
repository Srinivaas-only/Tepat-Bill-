import { and, eq, gte, inArray } from 'drizzle-orm';
import { needsReminder } from '../shared/core';
import { flagRowToCore } from './core-adapters';
import * as S from '../shared/schema';
import type { Db } from './db';

export type FlagRow = typeof S.flags.$inferSelect;

export interface FlagView {
  id: string; type: string; status: string; amountSen: number; sku: string | null; invoiceId: string | null; invoiceNo: string; invoiceLineId: string;
  stage: string; deliveryId: string | null; supersededBy: string | null;
  lineDescription: string; supplierId: string; supplierName: string; poId: string | null; poNo: string | null;
  missingQty: number | null; invoiceUnitSen: number | null; baselineUnitSen: number | null; baselineSource: string | null; pricedQty: number | null;
  direction: string | null; possibleSubstituteFor: string | null; request: string | null; settlement: string | null; note: string | null;
  reminderDue: boolean; needsRecheck: boolean; openedAt: number | null; sentAt: number | null; settledAt: number | null; createdAt: number;
}

const DAY = 86_400_000;
/** Flags that need a reminder and were not already reminded in the last 14 days. */
export async function reminderDueIds(db: Pick<Db, 'select'>, rows: FlagRow[], now: number): Promise<Set<string>> {
  const due = rows.filter(f => needsReminder(flagRowToCore(f), now));
  if (!due.length) return new Set();
  const recent = await db.select({ ref: S.events.ref }).from(S.events)
    .where(and(eq(S.events.action, 'flag.remind'), inArray(S.events.ref, due.map(f => f.id)), gte(S.events.at, new Date(now - 14 * DAY))));
  const hidden = new Set(recent.map(e => e.ref));
  return new Set(due.filter(f => !hidden.has(f.id)).map(f => f.id));
}

/** Joins the display fields (supplier, invoice/DO no, PO no, line description) onto flag rows. For delivery-stage flags `invoiceNo` carries the DO number. */
export async function toViews(db: Pick<Db, 'select'>, rows: FlagRow[]): Promise<FlagView[]> {
  if (!rows.length) return [];
  const uniq = <T,>(xs: (T | null | undefined)[]) => [...new Set(xs.filter((x): x is T => x !== null && x !== undefined))];
  const sup = await db.select().from(S.suppliers).where(inArray(S.suppliers.id, uniq(rows.map(r => r.supplierId))));
  const invIds = uniq(rows.map(r => r.invoiceId)), delIds = uniq(rows.map(r => r.deliveryId));
  const inv = invIds.length ? await db.select().from(S.invoices).where(inArray(S.invoices.id, invIds)) : [];
  const dels = delIds.length ? await db.select().from(S.deliveries).where(inArray(S.deliveries.id, delIds)) : [];
  const poIds = uniq(rows.map(r => r.poId));
  const pos = poIds.length ? await db.select().from(S.purchaseOrders).where(inArray(S.purchaseOrders.id, poIds)) : [];
  const lines = invIds.length ? await db.select().from(S.invoiceLines).where(inArray(S.invoiceLines.invoiceId, invIds)) : [];
  const dlines = delIds.length ? await db.select().from(S.deliveryLines).where(inArray(S.deliveryLines.deliveryId, delIds)) : [];
  const dueIds = await reminderDueIds(db, rows, Date.now());
  return rows.map(r => ({
    id: r.id, type: r.type, status: r.status, amountSen: r.amountSen, sku: r.sku, invoiceId: r.invoiceId,
    stage: r.stage, deliveryId: r.deliveryId, supersededBy: r.supersededBy,
    invoiceNo: (r.stage === 'delivery' ? dels.find(d => d.id === r.deliveryId)?.doNo : inv.find(i => i.id === r.invoiceId)?.invoiceNo) ?? '', invoiceLineId: r.invoiceLineId,
    lineDescription: (r.stage === 'delivery'
      ? dlines.find(l => l.deliveryId === r.deliveryId && l.lineId === r.invoiceLineId)?.description
      : lines.find(l => l.invoiceId === r.invoiceId && l.lineId === r.invoiceLineId)?.description) ?? '',
    supplierId: r.supplierId, supplierName: sup.find(s => s.id === r.supplierId)?.name ?? '', poId: r.poId, poNo: pos.find(p => p.id === r.poId)?.poNo ?? null,
    missingQty: r.missingQty, invoiceUnitSen: r.invoiceUnitSen, baselineUnitSen: r.baselineUnitSen, baselineSource: r.baselineSource, pricedQty: r.pricedQty,
    direction: r.direction, possibleSubstituteFor: r.possibleSubstituteFor, request: r.request, settlement: r.settlement, note: r.note,
    needsRecheck: r.needsRecheck, reminderDue: dueIds.has(r.id) && !r.supersededBy, openedAt: r.openedAt?.getTime() ?? null, sentAt: r.sentAt?.getTime() ?? null, settledAt: r.settledAt?.getTime() ?? null, createdAt: r.createdAt.getTime(),
  }));
}

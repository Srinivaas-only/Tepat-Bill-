import { inArray } from 'drizzle-orm';
import * as S from '../shared/schema';
import type { Db } from './db';

export type FlagRow = typeof S.flags.$inferSelect;

export interface FlagView {
  id: string; type: string; status: string; amountSen: number; sku: string | null; invoiceId: string; invoiceNo: string; invoiceLineId: string;
  lineDescription: string; supplierId: string; supplierName: string; poId: string | null; poNo: string | null;
  missingQty: number | null; invoiceUnitSen: number | null; baselineUnitSen: number | null; baselineSource: string | null; pricedQty: number | null;
  direction: string | null; possibleSubstituteFor: string | null; request: string | null; settlement: string | null; note: string | null;
  openedAt: number | null; sentAt: number | null; settledAt: number | null; createdAt: number;
}

/** Joins the display fields (supplier, invoice no, PO no, line description) onto flag rows. */
export async function toViews(db: Pick<Db, 'select'>, rows: FlagRow[]): Promise<FlagView[]> {
  if (!rows.length) return [];
  const sup = await db.select().from(S.suppliers).where(inArray(S.suppliers.id, [...new Set(rows.map(r => r.supplierId))]));
  const inv = await db.select().from(S.invoices).where(inArray(S.invoices.id, [...new Set(rows.map(r => r.invoiceId))]));
  const poIds = [...new Set(rows.map(r => r.poId).filter((x): x is string => !!x))];
  const pos = poIds.length ? await db.select().from(S.purchaseOrders).where(inArray(S.purchaseOrders.id, poIds)) : [];
  const lines = await db.select().from(S.invoiceLines).where(inArray(S.invoiceLines.invoiceId, inv.map(i => i.id)));
  return rows.map(r => ({
    id: r.id, type: r.type, status: r.status, amountSen: r.amountSen, sku: r.sku, invoiceId: r.invoiceId,
    invoiceNo: inv.find(i => i.id === r.invoiceId)?.invoiceNo ?? '', invoiceLineId: r.invoiceLineId,
    lineDescription: lines.find(l => l.invoiceId === r.invoiceId && l.lineId === r.invoiceLineId)?.description ?? '',
    supplierId: r.supplierId, supplierName: sup.find(s => s.id === r.supplierId)?.name ?? '', poId: r.poId, poNo: pos.find(p => p.id === r.poId)?.poNo ?? null,
    missingQty: r.missingQty, invoiceUnitSen: r.invoiceUnitSen, baselineUnitSen: r.baselineUnitSen, baselineSource: r.baselineSource, pricedQty: r.pricedQty,
    direction: r.direction, possibleSubstituteFor: r.possibleSubstituteFor, request: r.request, settlement: r.settlement, note: r.note,
    openedAt: r.openedAt?.getTime() ?? null, sentAt: r.sentAt?.getTime() ?? null, settledAt: r.settledAt?.getTime() ?? null, createdAt: r.createdAt.getTime(),
  }));
}

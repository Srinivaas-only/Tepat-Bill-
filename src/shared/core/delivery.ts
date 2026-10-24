// Two-phase checking (deck slides 4 + 5): check the DELIVERY when goods arrive, then compare the INVOICE against
// what was actually received. Pure; integer sen. Delivery amounts are ESTIMATES (priced at the baseline) and must
// never enter the ledger; only invoice-stage flags move money.
import { assertQty, baseline, detectFlags, matchLine, normalise,
  type AliasTable, type DetectedFlag, type InvLine, type PoLine, type PriceList, type Sen } from './rules';

export interface DeliveryLine { lineId: string; description: string; qty: number; box?: [number, number, number, number] }

/** Count for a delivery line: the staff count keyed `line:<lineId>`, else the delivered (printed) qty. */
const deliveredCount = (received: Record<string, number>, l: DeliveryLine) =>
  assertQty(received[`line:${l.lineId}`] ?? l.qty, 'received qty');

export interface DeliveryCheckInput {
  supplierId: string;
  po: PoLine[];
  lines: DeliveryLine[];                 // what the bon/DO says was delivered
  received: Record<string, number>;      // staff counts: `line:<lineId>` (and `<sku>` for PO-only lines)
  priceList: PriceList;
  aliases: AliasTable;
}

/**
 * At delivery: short_qty (counted < bon qty) and not_ordered (bon line not on the PO).
 * Each line is priced at its baseline (agreed -> PO price -> last invoice), else 0, so amountSen is an estimate
 * ("Anggaran") for display only. Price changes are an invoice-time question and are never raised here.
 */
export function checkDelivery(i: DeliveryCheckInput): DetectedFlag[] {
  const priced: InvLine[] = i.lines.map(l => {
    const m = matchLine(i.supplierId, { lineId: l.lineId, description: l.description, qty: l.qty, unitPriceSen: 0 }, i.po, i.aliases);
    return { lineId: l.lineId, description: l.description, qty: assertQty(l.qty, 'delivery qty'),
      unitPriceSen: m ? baseline(i.priceList[m.sku], m)?.sen ?? 0 : 0, box: l.box };
  });
  const received: Record<string, number> = { ...i.received };
  for (const l of i.lines) received[`line:${l.lineId}`] = deliveredCount(i.received, l); // untouched lines = as delivered
  return detectFlags({ supplierId: i.supplierId, po: i.po, invoice: priced, received, priceList: {}, aliases: i.aliases })
    .filter(f => f.type !== 'price_change');
}

export interface InvoiceFromDeliveryInput {
  supplierId: string;
  po: PoLine[];
  deliveryLines: DeliveryLine[];
  deliveryReceived: Record<string, number>;   // the delivery's saved counts
  invoiceLines: InvLine[];
  aliases: AliasTable;
}

/**
 * Received counts for an invoice, taken from the linked delivery (so the invoice is compared, not recounted).
 * Both sides are matched to PO skus; per sku the delivered counts are summed. Unmatched lines fall back to an exact
 * normalised-description match. An invoice line nothing was delivered for gets 0 (billed but not delivered).
 * Returns `line:<invoiceLineId>` keys plus `<sku>` keys for PO skus (so substitution detection keeps working).
 */
export function receivedFromDelivery(i: InvoiceFromDeliveryInput): Record<string, number> {
  const bySku: Record<string, number> = {};
  const byDesc: Record<string, number> = {};
  for (const l of i.deliveryLines) {
    const n = deliveredCount(i.deliveryReceived, l);
    const m = matchLine(i.supplierId, { lineId: l.lineId, description: l.description, qty: l.qty, unitPriceSen: 0 }, i.po, i.aliases);
    if (m) bySku[m.sku] = (bySku[m.sku] ?? 0) + n;
    else byDesc[normalise(l.description)] = (byDesc[normalise(l.description)] ?? 0) + n;
  }
  const out: Record<string, number> = {};
  for (const p of i.po) out[p.sku] = bySku[p.sku] ?? 0;
  // Invoice lines that share a sku (or an unmatched description) split the delivered total in order; the last one keeps any surplus,
  // so two lines are never each credited with the full delivery.
  const group = (l: InvLine) => { const m = matchLine(i.supplierId, l, i.po, i.aliases); return m ? `sku:${m.sku}` : `desc:${normalise(l.description)}`; };
  const left: Record<string, number> = {}, lastOf: Record<string, string> = {};
  for (const l of i.invoiceLines) {
    const g = group(l);
    left[g] ??= g.startsWith('sku:') ? bySku[g.slice(4)] ?? 0 : byDesc[g.slice(5)] ?? 0;
    lastOf[g] = l.lineId;
  }
  for (const l of i.invoiceLines) {
    const g = group(l);
    const n = lastOf[g] === l.lineId ? left[g] : Math.min(l.qty, left[g]);
    out[`line:${l.lineId}`] = n; left[g] -= n;
  }
  return out;
}

/** True when an invoice compared against its delivery has nothing to claim: ready to pay. */
export const readyToPay = (flags: Pick<DetectedFlag, 'amountSen' | 'type' | 'direction'>[]): boolean =>
  flags.every(f => f.type === 'price_change' && f.direction === 'down');

/** Sum of claimable amounts (integer sen), for result cards. */
export const claimableSen = (flags: Pick<DetectedFlag, 'amountSen'>[]): Sen =>
  flags.reduce((s, f) => s + f.amountSen, 0);

// ---------- fulfilment: the delivery against the COMPLETE order (deck slide 5) ----------
export type FulfilmentStatus = 'complete' | 'partial' | 'not_delivered' | 'over';
export interface FulfilmentRow {
  sku: string; description: string;
  ordered: number;       // PO
  delivered: number;     // what the bon(s) say arrived
  received: number;      // what staff counted
  billed: number;        // what invoices on this PO billed
  outstanding: number;   // still to come: ordered - received, never below 0
  billedNotReceived: number; // billed above what was received (a money question: the invoice short_qty flag), not a partial delivery
  status: FulfilmentStatus;
}
export interface FulfilmentInput {
  supplierId: string;
  po: PoLine[];
  deliveries: { lines: DeliveryLine[]; received: Record<string, number> }[];   // every delivery recorded against this PO
  invoiceLines?: { description: string; qty: number }[];                       // lines of the invoices on this PO
  aliases: AliasTable;
}
/**
 * Per PO line: ordered / delivered / received / billed / outstanding, INCLUDING order lines that no delivery mentions.
 * A legitimate partial delivery (received < ordered, nothing billed beyond it) shows as `partial` with `outstanding`;
 * goods billed but not received show separately as `billedNotReceived`. Raises no money flag by itself.
 */
export function fulfilment(i: FulfilmentInput): FulfilmentRow[] {
  const rows = new Map<string, FulfilmentRow>(i.po.map(p => [p.sku, { sku: p.sku, description: p.description, ordered: p.orderedQty, delivered: 0, received: 0, billed: 0, outstanding: 0, billedNotReceived: 0, status: 'not_delivered' as FulfilmentStatus }]));
  for (const d of i.deliveries) for (const l of d.lines) {
    const m = matchLine(i.supplierId, { lineId: l.lineId, description: l.description, qty: l.qty, unitPriceSen: 0 }, i.po, i.aliases);
    const row = m && rows.get(m.sku); if (!row) continue;
    row.delivered += assertQty(l.qty, 'delivery qty'); row.received += deliveredCount(d.received, l);
  }
  for (const l of i.invoiceLines ?? []) {
    const m = matchLine(i.supplierId, { lineId: '', description: l.description, qty: l.qty, unitPriceSen: 0 }, i.po, i.aliases);
    const row = m && rows.get(m.sku); if (row) row.billed += assertQty(l.qty, 'invoice qty');
  }
  return [...rows.values()].map(r => ({ ...r, outstanding: Math.max(0, r.ordered - r.received), billedNotReceived: Math.max(0, r.billed - r.received),
    status: r.received === 0 ? 'not_delivered' : r.received > r.ordered ? 'over' : r.received === r.ordered ? 'complete' : 'partial' }));
}

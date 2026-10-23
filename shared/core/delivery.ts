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
  for (const l of i.invoiceLines) {
    const m = matchLine(i.supplierId, l, i.po, i.aliases);
    out[`line:${l.lineId}`] = m ? bySku[m.sku] ?? 0 : byDesc[normalise(l.description)] ?? 0;
  }
  return out;
}

/** True when an invoice compared against its delivery has nothing to claim: ready to pay. */
export const readyToPay = (flags: Pick<DetectedFlag, 'amountSen' | 'type' | 'direction'>[]): boolean =>
  flags.every(f => f.type === 'price_change' && f.direction === 'down');

/** Sum of claimable amounts (integer sen), for result cards. */
export const claimableSen = (flags: Pick<DetectedFlag, 'amountSen'>[]): Sen =>
  flags.reduce((s, f) => s + f.amountSen, 0);

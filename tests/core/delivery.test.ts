import { describe, it, expect } from 'vitest';
import { checkDelivery, receivedFromDelivery, readyToPay, claimableSen, fulfilment } from '../../src/shared/core/delivery';
import { detectFlags, type PoLine } from '../../src/shared/core/rules';

const po: PoLine[] = [{ sku: 'maggi', description: 'Maggi kari', orderedQty: 10 }, { sku: 'gula', description: 'Gula pasir 1kg', orderedQty: 50 }];
const doLines = [{ lineId: 'L1', description: "MAGGI KARI 5'S (CTN 8 PEK)", qty: 10 }, { lineId: 'L2', description: 'GULA PASIR 1KG', qty: 50 }];
const priceList = { maggi: { lastInvoiceSen: 4500 }, gula: { lastInvoiceSen: 280 } };

describe('checkDelivery (at delivery, estimates only)', () => {
  it('exact delivery -> no flags', () =>
    expect(checkDelivery({ supplierId: 'S', po, lines: doLines, received: {}, priceList, aliases: {} })).toEqual([]));
  it('short delivery -> short_qty priced at the baseline (estimate)', () => {
    const f = checkDelivery({ supplierId: 'S', po, lines: doLines, received: { 'line:L1': 8 }, priceList, aliases: {} });
    expect(f).toEqual([expect.objectContaining({ type: 'short_qty', sku: 'maggi', missingQty: 2, amountSen: 9000 })]);
  });
  it('never raises price changes; unknown price -> estimate 0', () => {
    const f = checkDelivery({ supplierId: 'S', po, lines: doLines, received: { 'line:L2': 45 }, priceList: {}, aliases: {} });
    expect(f).toEqual([expect.objectContaining({ type: 'short_qty', missingQty: 5, amountSen: 0 })]);
  });
  it('item not on the PO -> not_ordered', () => {
    const f = checkDelivery({ supplierId: 'S', po, lines: [...doLines, { lineId: 'L3', description: 'Nestum 500g', qty: 3 }], received: {}, priceList, aliases: {} });
    expect(f.map(x => x.type)).toEqual(['not_ordered']);
  });
});

describe('receivedFromDelivery (invoice compared against what arrived)', () => {
  const inv = [{ lineId: 'L1', description: "MAGGI KARI 5'S (CTN 8 PEK)", qty: 10, unitPriceSen: 4500 },
               { lineId: 'L2', description: 'GULA PASIR 1KG', qty: 50, unitPriceSen: 320 }];
  it('maps delivered counts onto invoice lines by sku; billed 10 vs received 8 -> RM90 short + Gula price', () => {
    const received = receivedFromDelivery({ supplierId: 'S', po, deliveryLines: doLines, deliveryReceived: { 'line:L1': 8 }, invoiceLines: inv, aliases: {} });
    expect(received).toMatchObject({ 'line:L1': 8, 'line:L2': 50, maggi: 8, gula: 50 });
    const flags = detectFlags({ supplierId: 'S', po, invoice: inv, received, priceList, aliases: {} });
    expect(flags.map(f => [f.type, f.amountSen])).toEqual([['short_qty', 9000], ['price_change', 2000]]);
    expect(claimableSen(flags)).toBe(11000);
    expect(readyToPay(flags)).toBe(false);
  });
  it('billed but nothing delivered -> 0 received', () => {
    const r = receivedFromDelivery({ supplierId: 'S', po, deliveryLines: [doLines[1]], deliveryReceived: {}, invoiceLines: inv, aliases: {} });
    expect(r['line:L1']).toBe(0);
  });
  it('sums several delivery lines of the same sku', () => {
    const r = receivedFromDelivery({ supplierId: 'S', po, deliveryLines: [doLines[0], { lineId: 'L9', description: 'Maggi kari', qty: 2 }],
      deliveryReceived: { 'line:L1': 8 }, invoiceLines: inv, aliases: {} });
    expect(r['line:L1']).toBe(10);
  });
  it('readyToPay: only RM0 price decreases allowed', () => {
    expect(readyToPay([])).toBe(true);
    expect(readyToPay([{ type: 'price_change', direction: 'down', amountSen: 0 }])).toBe(true);
    expect(readyToPay([{ type: 'short_qty', amountSen: 100 }])).toBe(false);
  });
});

describe('fulfilment against the complete order (audit: PO 10 / DO 8 / counted 8)', () => {
  const po: PoLine[] = [{ sku: 'maggi', description: 'Maggi Kari 5s', orderedQty: 10 }, { sku: 'gula', description: 'Gula Pasir 1kg', orderedQty: 50 }, { sku: 'teh', description: 'Teh Cap Bunga 500g', orderedQty: 6 }];
  const base = { supplierId: 'S', po, aliases: {} };
  it('shows a partial delivery with the outstanding quantity, and order lines no delivery mentions', () => {
    const r = fulfilment({ ...base, deliveries: [{ lines: [{ lineId: 'L1', description: 'Maggi Kari 5s', qty: 8 }, { lineId: 'L2', description: 'Gula Pasir 1kg', qty: 50 }], received: {} }] });
    expect(r.find(x => x.sku === 'maggi')).toMatchObject({ ordered: 10, delivered: 8, received: 8, outstanding: 2, status: 'partial', billedNotReceived: 0 });
    expect(r.find(x => x.sku === 'gula')).toMatchObject({ outstanding: 0, status: 'complete' });
    expect(r.find(x => x.sku === 'teh')).toMatchObject({ delivered: 0, received: 0, outstanding: 6, status: 'not_delivered' });
  });
  it('keeps goods billed but not received separate from a legitimate partial delivery', () => {
    const r = fulfilment({ ...base, deliveries: [{ lines: [{ lineId: 'L1', description: 'Maggi Kari 5s', qty: 8 }], received: {} }], invoiceLines: [{ description: 'Maggi Kari 5s', qty: 10 }] });
    expect(r.find(x => x.sku === 'maggi')).toMatchObject({ billed: 10, received: 8, billedNotReceived: 2, outstanding: 2 });
  });
  it('uses the staff count, sums several deliveries, and never goes negative', () => {
    const r = fulfilment({ ...base, deliveries: [
      { lines: [{ lineId: 'L1', description: 'Maggi Kari 5s', qty: 8 }], received: { 'line:L1': 6 } },
      { lines: [{ lineId: 'L1', description: 'Maggi Kari 5s', qty: 6 }], received: {} }] });
    expect(r.find(x => x.sku === 'maggi')).toMatchObject({ delivered: 14, received: 12, outstanding: 0, status: 'over' });
  });
});

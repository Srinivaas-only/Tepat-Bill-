import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { detectFlags, formatRM, parseRM, autofillPriceList, setAgreedPrice, learnAlias, matchLine,
  poNumber, rankPoCandidates, looksForeign, type LineCheckInput, type PriceList } from './rules';

const base = (o: Partial<LineCheckInput> = {}): LineCheckInput => ({
  supplierId: 'S1',
  po: [{ sku: 'BERAS10', description: 'Beras 10kg', orderedQty: 10 }],
  invoice: [{ lineId: 'L1', description: 'BERAS 10 KG', qty: 10, unitPriceSen: 4500 }],
  received: { BERAS10: 10 }, priceList: { BERAS10: { lastInvoiceSen: 4500 } }, aliases: {}, ...o,
});

describe('short quantity', () => {
  it('received 8 vs invoice 10 @ RM45.00 -> RM90.00', () => {
    const f = detectFlags(base({ received: { BERAS10: 8 } }));
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ type: 'short_qty', missingQty: 2, amountSen: 9000 });
    expect(formatRM(f[0].amountSen)).toBe('RM90.00');
  });
  it('exact -> no flags', () => expect(detectFlags(base())).toEqual([]));
  it('received < PO but invoice billed only received qty -> no money flag (no double charge)', () => {
    const f = detectFlags(base({ invoice: [{ lineId: 'L1', description: 'Beras 10kg', qty: 8, unitPriceSen: 4500 }], received: { BERAS10: 8 } }));
    expect(f).toEqual([]);
  });
  it('received > invoice -> no flag', () =>
    expect(detectFlags(base({ received: { BERAS10: 12 } }))).toEqual([]));
});

describe('price change vs price list', () => {
  const milo = (unit: number, qty = 50) => base({
    po: [{ sku: 'MILO1', description: 'Milo 1kg', orderedQty: qty }],
    invoice: [{ lineId: 'L1', description: 'MILO TIN 1KG', qty, unitPriceSen: unit }], received: { MILO1: qty } });
  it('+RM0.40 x 50 -> RM20.00', () => {
    const f = detectFlags({ ...milo(1640), priceList: { MILO1: { lastInvoiceSen: 1600 } } });
    expect(f).toEqual([expect.objectContaining({ type: 'price_change', amountSen: 2000, direction: 'up', pricedQty: 50, baselineSource: 'last_invoice' })]);
    expect(formatRM(f[0].amountSen)).toBe('RM20.00');
  });
  it('first invoice from supplier -> no flag, and sets baseline', () => {
    const inp = { ...milo(1640), priceList: {} as PriceList };
    expect(detectFlags(inp)).toEqual([]);
    const pl = autofillPriceList(inp.priceList, [{ sku: 'MILO1', unitPriceSen: 1640 }]);
    expect(pl.MILO1.lastInvoiceSen).toBe(1640);
    expect(detectFlags({ ...milo(1640), priceList: pl })).toEqual([]);
  });
  it('owner agreed price overrides last-invoice price', () => {
    const pl = setAgreedPrice({ MILO1: { lastInvoiceSen: 1640 } }, 'MILO1', 1600);
    expect(detectFlags({ ...milo(1640), priceList: pl })[0]).toMatchObject({ baselineUnitSen: 1600, baselineSource: 'agreed', amountSen: 2000 });
    // auto-fill never overwrites the agreed price
    const pl2 = autofillPriceList(pl, [{ sku: 'MILO1', unitPriceSen: 1700 }]);
    expect(detectFlags({ ...milo(1700), priceList: pl2 })[0]).toMatchObject({ baselineUnitSen: 1600, amountSen: 5000 });
  });
  it('baseline chain: PO line price is used when no agreed price', () => {
    const inp = { ...milo(1640), po: [{ sku: 'MILO1', description: 'Milo 1kg', orderedQty: 50, unitPriceSen: 1600 }], priceList: { MILO1: { lastInvoiceSen: 1640 } } };
    expect(detectFlags(inp)[0]).toMatchObject({ baselineUnitSen: 1600, baselineSource: 'po', amountSen: 2000 });
    // agreed still beats PO price
    expect(detectFlags({ ...inp, priceList: setAgreedPrice(inp.priceList, 'MILO1', 1620) })[0]).toMatchObject({ baselineSource: 'agreed', amountSen: 1000 });
  });
  it('dismissing as inflation = autofill without skip: next identical invoice raises no flag', () => {
    const pl = autofillPriceList({ MILO1: { lastInvoiceSen: 1600 } }, [{ sku: 'MILO1', unitPriceSen: 1640 }]);
    expect(detectFlags({ ...milo(1640), priceList: pl })).toEqual([]);
  });
  it('flagged line does not become baseline when skipped', () => {
    const pl = autofillPriceList({ MILO1: { lastInvoiceSen: 1600 } }, [{ sku: 'MILO1', unitPriceSen: 1640 }], new Set(['MILO1']));
    expect(pl.MILO1.lastInvoiceSen).toBe(1600);
  });
  it('price decrease -> informational flag, amount 0', () => {
    expect(detectFlags({ ...milo(1500), priceList: { MILO1: { lastInvoiceSen: 1600 } } })[0])
      .toMatchObject({ direction: 'down', amountSen: 0 });
  });
});

describe('short AND price-changed on same line', () => {
  it('shortage at invoice price on missing units; price impact only on received units', () => {
    // invoice 10 @ 47.00, baseline 45.00, received 8
    const f = detectFlags(base({ invoice: [{ lineId: 'L1', description: 'Beras 10kg', qty: 10, unitPriceSen: 4700 }], received: { BERAS10: 8 } }));
    const short = f.find(x => x.type === 'short_qty')!, price = f.find(x => x.type === 'price_change')!;
    expect(short.amountSen).toBe(2 * 4700);   // RM94.00
    expect(price.amountSen).toBe(8 * 200);    // RM16.00
    // total = billed - fair value of what arrived = 10*47 - 8*45 = 110.00
    expect(short.amountSen + price.amountSen).toBe(10 * 4700 - 8 * 4500);
  });
  it('fast-check: short + price never exceeds billed − fair, equals it on increases; integers only', () => {
    fc.assert(fc.property(
      fc.integer({ min: 0, max: 500 }), fc.integer({ min: 0, max: 500 }),
      fc.integer({ min: 1, max: 1_000_000 }), fc.integer({ min: 1, max: 1_000_000 }),
      (qty, rec, unit, baseSen) => {
        const f = detectFlags(base({ invoice: [{ lineId: 'L1', description: 'Beras 10kg', qty, unitPriceSen: unit }],
          received: { BERAS10: rec }, priceList: { BERAS10: { lastInvoiceSen: baseSen } } }));
        const total = f.reduce((s, x) => s + x.amountSen, 0);
        f.forEach(x => { expect(Number.isSafeInteger(x.amountSen)).toBe(true); expect(x.amountSen).toBeGreaterThanOrEqual(0); });
        const billed = qty * unit, fair = Math.min(qty, rec) * baseSen;
        if (unit >= baseSen) expect(total).toBe(Math.max(0, billed - fair));
        else expect(total).toBe(Math.max(0, qty - rec) * unit); // decrease: only the shortage is claimable
      }), { numRuns: 2000 });
  });
});

describe('not ordered', () => {
  const inp = base({ invoice: [
    { lineId: 'L1', description: 'Beras 10kg', qty: 10, unitPriceSen: 4500 },
    { lineId: 'L2', description: 'KOPI O KAWNG 1KG', qty: 3, unitPriceSen: 1200 }],
    po: [{ sku: 'BERAS10', description: 'Beras 10kg', orderedQty: 10 }, { sku: 'KOPI', description: 'Serbuk kopi Cap Kapal Api', orderedQty: 3 }],
    received: { BERAS10: 10, KOPI: 3 }, priceList: { BERAS10: { lastInvoiceSen: 4500 }, KOPI: { lastInvoiceSen: 1200 } } });
  it('line with no PO match -> not_ordered flag with qty x price', () =>
    expect(detectFlags(inp)).toEqual([expect.objectContaining({ type: 'not_ordered', invoiceLineId: 'L2', amountSen: 3600 })]));
  it('after owner correction (alias learned) -> no flag', () => {
    const aliases = learnAlias({}, 'S1', 'kopi o kawng 1 kg', 'KOPI');
    expect(detectFlags({ ...inp, aliases })).toEqual([]);
  });
  it('alias is per supplier', () => {
    const aliases = learnAlias({}, 'S2', 'KOPI O KAWNG 1KG', 'KOPI');
    expect(detectFlags({ ...inp, aliases })).toHaveLength(1);
  });
  it('token match MILO TIN 1KG <-> Milo 1kg', () =>
    expect(matchLine('S1', { lineId: 'x', description: 'MILO TIN 1KG', qty: 1, unitPriceSen: 1 },
      [{ sku: 'M', description: 'Milo 1kg', orderedQty: 1 }], {})?.sku).toBe('M'));
});

describe('substitution guard', () => {
  it('unmatched invoice line + PO line received 0 and not billed -> not_ordered with possibleSubstituteFor', () => {
    const f = detectFlags(base({
      po: [{ sku: 'BERAS10', description: 'Beras 10kg', orderedQty: 10 }, { sku: 'MILO1', description: 'Milo 1kg', orderedQty: 5 }],
      invoice: [{ lineId: 'L1', description: 'Beras 10kg', qty: 10, unitPriceSen: 4500 },
                { lineId: 'L2', description: 'Nestum 500g', qty: 5, unitPriceSen: 1300 }],
      received: { BERAS10: 10, MILO1: 0 } }));
    expect(f).toEqual([expect.objectContaining({ type: 'not_ordered', invoiceLineId: 'L2', amountSen: 6500, possibleSubstituteFor: 'MILO1' })]);
  });
  it('no candidate when every PO line was billed', () => {
    const f = detectFlags(base({ invoice: [{ lineId: 'L1', description: 'Beras 10kg', qty: 10, unitPriceSen: 4500 },
      { lineId: 'L2', description: 'Nestum 500g', qty: 1, unitPriceSen: 1300 }] }));
    expect(f[0].possibleSubstituteFor).toBeUndefined();
  });
});

describe('documents', () => {
  it('PO numbers PO-YYMM-###', () => expect(poNumber(new Date(2026, 9, 22), 7)).toBe('PO-2610-007'));
  it('PO suggestion ranks supplier + items + date', () => {
    const DAY = 86_400_000;
    const r = rankPoCandidates({ supplierName: 'Syarikat Borong Ali Sdn Bhd', issuedAt: 10 * DAY, lines: [{ description: 'MILO TIN 1KG' }, { description: 'Gula 1kg' }] }, [
      { id: 'other', supplierName: 'Kedai Lim', orderedAt: 10 * DAY, lines: [{ sku: 'x', description: 'Milo 1kg', orderedQty: 1 }] },
      { id: 'right', supplierName: 'Borong Ali', orderedAt: 8 * DAY, lines: [{ sku: 'm', description: 'Milo 1kg', orderedQty: 1 }, { sku: 'g', description: 'Gula pasir 1kg', orderedQty: 1 }] },
    ]);
    expect(r[0].id).toBe('right');
  });
  it('foreign supplier suggestion', () => {
    expect(looksForeign('USD')).toBe(true); expect(looksForeign(undefined, 'CN')).toBe(true);
    expect(looksForeign('MYR', 'MY')).toBe(false); expect(looksForeign()).toBe(false);
  });
  it('parseRM: AI price strings -> sen', () => {
    expect(parseRM('45.00')).toBe(4500); expect(parseRM('RM 1,250.5')).toBe(125050); expect(parseRM('16')).toBe(1600);
    expect(() => parseRM('45.005')).toThrow(); expect(() => parseRM('abc')).toThrow();
  });
});

describe('integers only', () => {
  it('rejects float sen / qty', () => {
    expect(() => detectFlags(base({ invoice: [{ lineId: 'L1', description: 'Beras 10kg', qty: 2.5, unitPriceSen: 4500 }] }))).toThrow();
    expect(() => detectFlags(base({ invoice: [{ lineId: 'L1', description: 'Beras 10kg', qty: 2, unitPriceSen: 45.5 }] }))).toThrow();
  });
});

// Regression tests for the independent core audit (Round 5+). Each block pins one real defect found with a concrete input.
import { describe, it, expect } from 'vitest';
import { detectFlags, matchLine, normalise, sameSize, autofillPriceList, baseline, acceptPrice, looksForeign, supplierOverlap, rankPoCandidates,
  type PoLine } from './rules';
import { receivedFromDelivery } from './delivery';
import { draftMessage, toMsisdn, type MessageInput } from './messages';

const line = (description: string, lineId = 'L1', qty = 1) => ({ lineId, description, qty, unitPriceSen: 100 });

describe('C1 item matching never confuses pack sizes', () => {
  const po = (d: string): PoLine[] => [{ sku: 'x', description: d, orderedQty: 1 }];
  it.each([
    ['Minyak Masak 5kg', 'Minyak Masak 1kg'], ['Beras Faiza 10kg', 'Beras Faiza 5kg'], ['Tepung 1kg', 'Tepung 500g'],
    ['Air Mineral 1.5L', 'Air Mineral 600ml'],
  ])('%s does not match %s', (inv, p) => expect(matchLine('S', line(inv), po(p), {})).toBeUndefined());
  it('same size still matches, spacing and case ignored', () => {
    expect(matchLine('S', line('BERAS 10 KG'), po('Beras 10kg'), {})?.sku).toBe('x');
    expect(matchLine('S', line("MAGGI KARI 5'S (CTN 8 PEK)"), po('Maggi kari'), {})?.sku).toBe('x'); // demo fixture, no size on the PO side
    expect(matchLine('S', line('Gula Pasir 1KG'), po('Gula pasir 1kg'), {})?.sku).toBe('x');
  });
  it('a size mismatch does not hide behind an owner alias (alias still wins)', () => {
    expect(matchLine('S', line('Minyak 5kg'), po('Minyak 1kg'), { S: { [normalise('Minyak 5kg')]: 'x' } })?.sku).toBe('x');
  });
  it('wrong size is reported as not_ordered, not as a huge price change', () => {
    const f = detectFlags({ supplierId: 'S', po: [{ sku: 'minyak-1kg', description: 'Minyak Masak 1kg', orderedQty: 5 }],
      invoice: [{ lineId: 'L1', description: 'Minyak Masak 5kg', qty: 5, unitPriceSen: 3190 }], received: { 'line:L1': 5 },
      priceList: { 'minyak-1kg': { lastInvoiceSen: 550 } }, aliases: {} });
    expect(f.map(x => x.type)).toEqual(['not_ordered']);
  });
});

describe('C2 non-ASCII descriptions', () => {
  it('Chinese text is kept by normalise and never collapses to ""', () => {
    expect(normalise('白糖')).toBe('白糖');
    expect(normalise('红糖 1kg')).toBe('红糖 1kg');
  });
  it('a Chinese description does not match an unrelated Malay PO line just because of the size', () => {
    expect(matchLine('S', line('红糖 1kg'), [{ sku: 'gula', description: 'Gula Pasir 1kg', orderedQty: 1 }], {})).toBeUndefined();
  });
});

describe('C3 two invoice lines for one sku share the delivered total', () => {
  const po: PoLine[] = [{ sku: 'gula', description: 'Gula pasir 1kg', orderedQty: 10 }];
  const del = [{ lineId: 'D1', description: 'Gula pasir 1kg', qty: 10 }];
  const inv = [{ lineId: 'L1', description: 'Gula pasir 1kg', qty: 5, unitPriceSen: 280 }, { lineId: 'L2', description: 'Gula pasir 1kg', qty: 5, unitPriceSen: 280 }];
  it('delivered 6 of 10 -> L1 5, L2 1 -> short 4 (not zero)', () => {
    const r = receivedFromDelivery({ supplierId: 'S', po, deliveryLines: del, deliveryReceived: { 'line:D1': 6 }, invoiceLines: inv, aliases: {} });
    expect(r['line:L1']).toBe(5); expect(r['line:L2']).toBe(1);
    const f = detectFlags({ supplierId: 'S', po, invoice: inv, received: r, priceList: {}, aliases: {} });
    expect(f.filter(x => x.type === 'short_qty').reduce((s, x) => s + (x.missingQty ?? 0), 0)).toBe(4);
  });
  it('a single invoice line keeps the whole delivered count (over-delivery unchanged)', () => {
    const r = receivedFromDelivery({ supplierId: 'S', po, deliveryLines: [{ ...del[0], qty: 12 }], deliveryReceived: {}, invoiceLines: [inv[0]], aliases: {} });
    expect(r['line:L1']).toBe(12);
  });
  it('over-delivery across two lines: the surplus stays on the last line', () => {
    const r = receivedFromDelivery({ supplierId: 'S', po, deliveryLines: [{ ...del[0], qty: 12 }], deliveryReceived: {}, invoiceLines: inv, aliases: {} });
    expect(r['line:L1']).toBe(5); expect(r['line:L2']).toBe(7);
  });
});

describe('C4 no price flag when nothing was received', () => {
  it('received 0 of 10 at a higher price -> only the shortage', () => {
    const f = detectFlags({ supplierId: 'S', po: [{ sku: 'm', description: 'Maggi', orderedQty: 10 }], invoice: [{ lineId: 'L1', description: 'Maggi', qty: 10, unitPriceSen: 320 }],
      received: { 'line:L1': 0 }, priceList: { m: { lastInvoiceSen: 280 } }, aliases: {} });
    expect(f.map(x => x.type)).toEqual(['short_qty']);
  });
});

describe('C5 a zero price is never a baseline', () => {
  it('autofill ignores unit price 0', () => expect(autofillPriceList({}, [{ sku: 'm', unitPriceSen: 0 }])).toEqual({}));
  it('baseline ignores a stored 0 (and a PO price of 0)', () => {
    expect(baseline({ lastInvoiceSen: 0 })).toBeUndefined();
    expect(baseline({ lastInvoiceSen: 280 }, { sku: 'm', description: 'm', orderedQty: 1, unitPriceSen: 0 })).toEqual({ sen: 280, source: 'last_invoice' });
  });
  it('free-of-charge first invoice does not flag the next paid one as +RM160', () => {
    const pl = autofillPriceList({}, [{ sku: 'm', unitPriceSen: 0 }]);
    const f = detectFlags({ supplierId: 'S', po: [{ sku: 'm', description: 'Maggi', orderedQty: 50 }], invoice: [{ lineId: 'L1', description: 'Maggi', qty: 50, unitPriceSen: 320 }],
      received: { 'line:L1': 50 }, priceList: pl, aliases: {} });
    expect(f).toEqual([]);
  });
});

describe('C6 acceptPrice ("Ini kenaikan biasa") really moves the baseline', () => {
  it('works when an agreed price exists, and when the PO has a price', () => {
    const pl = acceptPrice({ m: { agreedSen: 280, lastInvoiceSen: 280 } }, 'm', 320);
    expect(baseline(pl.m, { sku: 'm', description: 'm', orderedQty: 1, unitPriceSen: 280 })).toEqual({ sen: 320, source: 'agreed' });
    const f = detectFlags({ supplierId: 'S', po: [{ sku: 'm', description: 'Maggi', orderedQty: 5, unitPriceSen: 280 }], invoice: [{ lineId: 'L1', description: 'Maggi', qty: 5, unitPriceSen: 320 }],
      received: { 'line:L1': 5 }, priceList: pl, aliases: {} });
    expect(f).toEqual([]);
  });
  it('rejects a non-integer price', () => expect(() => acceptPrice({}, 'm', 3.2)).toThrow());
});

describe('C7 delivery-stage messages never read like an invoice claim', () => {
  const base: MessageInput = { lang: 'ms', shopName: 'Kedai Runcit Maju', supplierName: 'Borong Ali', invoiceNo: 'DO-5512', invoiceDate: '20/10/2026', evidenceUrl: 'https://t/e/1',
    docKind: 'delivery', lines: [{ type: 'short_qty', item: 'Maggi', billedQty: 10, receivedQty: 8, missingQty: 2, amountSen: 0, request: 'send_missing' }] };
  it('BM: says bon, no "= RM0.00"', () => {
    const m = draftMessage(base);
    expect(m).toContain('Merujuk bon penghantaran DO-5512 bertarikh 20/10/2026:');
    expect(m).toContain('• Maggi: dalam bon 10, diterima 8. Kurang 2 unit.');
    expect(m).not.toContain('RM0.00'); expect(m).not.toContain('invois');
  });
  it('EN: says delivery order, singular/plural correct, estimate wording when priced', () => {
    const m = draftMessage({ ...base, lang: 'en', lines: [{ ...base.lines[0], missingQty: 1, amountSen: 4500 }] });
    expect(m).toContain('For delivery order DO-5512 dated 20/10/2026:');
    expect(m).toContain('Short 1 unit (estimate RM45.00).');
  });
  it('invoice messages are unchanged: the PRD example stays byte-identical', () => {
    const inv: MessageInput = { ...base, docKind: undefined, invoiceNo: 'INV-2291', poNo: 'PO-2610-004',
      lines: [{ type: 'short_qty', item: "MAGGI KARI 5'S (CTN 8 PEK)", billedQty: 10, receivedQty: 8, missingQty: 2, amountSen: 9000, request: 'deduct' },
        { type: 'price_change', item: 'GULA PASIR 1KG', invoiceUnitSen: 320, agreedUnitSen: 280, pricedQty: 50, amountSen: 2000, request: 'agreed_price' }] };
    expect(draftMessage(inv)).toBe([
      'Salam sejahtera Borong Ali, ini Kedai Runcit Maju.',
      'Merujuk invois INV-2291 bertarikh 20/10/2026 (pesanan PO-2610-004):',
      "• MAGGI KARI 5'S (CTN 8 PEK): dalam invois 10, diterima 8. Kurang 2 unit = RM90.00.",
      '• GULA PASIR 1KG: harga invois RM3.20/unit, harga yang dipersetujui RM2.80/unit, untuk 50 unit = perbezaan RM20.00.',
      'Jumlah: RM110.00.', 'Mohon tolak jumlah ini daripada invois.', 'Mohon caj mengikut harga yang dipersetujui.',
      'Bukti (gambar & dokumen): https://t/e/1', 'Terima kasih.'].join('\n'));
  });
  it('EN invoice plurals', () => {
    const m = draftMessage({ ...base, docKind: undefined, lang: 'en', invoiceNo: 'INV-1', lines: [{ type: 'not_ordered', item: 'Nestum', qty: 1, amountSen: 800, request: 'collect_back' }] });
    expect(m).toContain('1 unit (RM8.00) was not in our order.');
  });
});

describe('C8 phone numbers', () => {
  it.each([['+60 012-345 6789', '60123456789'], ['0060123456789', '60123456789'], ['012-345 6789', '60123456789'], ['011-2345 6789', '601123456789']])('%s -> %s', (raw, out) => expect(toMsisdn(raw)).toBe(out));
  it('landlines and junk are not WhatsApp numbers', () => {
    for (const raw of ['03-1234 5678', '12345', 'abc', '']) expect(toMsisdn(raw)).toBeUndefined();
  });
});

describe('C9 looksForeign', () => {
  it('RM, MYR, spaces and MYS are domestic', () => {
    expect(looksForeign('RM', 'MYS')).toBe(false); expect(looksForeign(' myr ', 'Malaysia ')).toBe(false); expect(looksForeign('MYR', 'MY')).toBe(false);
  });
  it('USD or CN are foreign', () => { expect(looksForeign('USD')).toBe(true); expect(looksForeign('MYR', 'CN')).toBe(true); });
});

describe('C10 supplier names ignore company words', () => {
  it('Borong Ali never matches Borong Abu; same business with suffixes does', () => {
    expect(supplierOverlap('Syarikat Borong Ali Sdn Bhd', 'Syarikat Borong Abu Sdn Bhd')).toBeLessThan(0.6);
    expect(supplierOverlap('Syarikat Borong Ali Sdn. Bhd.', 'Borong Ali Trading')).toBeGreaterThanOrEqual(0.6);
    expect(supplierOverlap('Sdn Bhd', 'Syarikat Sdn Bhd')).toBeGreaterThanOrEqual(0); // only generic words: no throw
  });
  it('PO ranking uses it: the right supplier wins', () => {
    const pos = [{ id: 'abu', supplierName: 'Syarikat Borong Abu Sdn Bhd', orderedAt: 0, lines: [] }, { id: 'ali', supplierName: 'Borong Ali Trading', orderedAt: 0, lines: [] }];
    expect(rankPoCandidates({ supplierName: 'Syarikat Borong Ali Sdn. Bhd.', issuedAt: 0, lines: [] }, pos)[0].id).toBe('ali');
  });
});

describe('C12 a stale alias falls back to matching instead of a false not_ordered', () => {
  it('alias points to a sku that is not on this PO', () => {
    const m = matchLine('S', line('Roti Kaya'), [{ sku: 'roti-kaya-2', description: 'Roti Kaya', orderedQty: 1 }], { S: { [normalise('Roti Kaya')]: 'roti-kaya' } });
    expect(m?.sku).toBe('roti-kaya-2');
  });
});

describe('review round: decimal and converted pack sizes', () => {
  const po = (d: string): PoLine[] => [{ sku: 'x', description: d, orderedQty: 1 }];
  it.each([['Minyak Masak 1.5kg', 'Minyak Masak 5kg'], ['Air Mineral 1.5L', 'Air Mineral 5L'], ['Beras 2.5kg', 'Beras 5kg'], ['Susu 1L', 'Susu 1.5L']])(
    '%s does not match %s', (inv, p) => expect(matchLine('S', line(inv), po(p), {})).toBeUndefined());
  it.each([['Air 1L', 'Air 1000ml'], ['Gula 1kg', 'Gula 1000g'], ['Susu 200ml', 'Susu 0.2L'], ['Beras 1.5kg', 'Beras 1500g'], ['Gula 1 KG', 'Gula 1kg'], ['Tepung 500 gm', 'Tepung 500g']])(
    'sameSize: %s = %s (same pack, different notation)', (a, b) => expect(sameSize(a, b)).toBe(true));
  it.each([['Minyak 1.5kg', 'Minyak 5kg'], ['Air 1L', 'Air 1.5L'], ['Tepung 1kg', 'Tepung 500g']])('sameSize: %s != %s', (a, b) => expect(sameSize(a, b)).toBe(false));
  it('no size on either side never blocks', () => expect(sameSize('Maggi Kari', "MAGGI KARI 5'S (CTN 8 PEK)")).toBe(true));
});
describe('review round: supplier subset names', () => {
  it('a name that is only a part of another is not a full match', () => {
    expect(supplierOverlap('Maju', 'Maju Jaya Trading')).toBeLessThan(0.6);
    expect(supplierOverlap('Ali Sdn Bhd', 'Ali Abu Sdn Bhd')).toBeLessThan(0.6);
  });
  it('real variants of one business still match', () => {
    expect(supplierOverlap('Syarikat Borong Ali Sdn. Bhd.', 'Borong Ali')).toBe(1);
    expect(supplierOverlap('LIM BROTHERS TRADING', 'Lim Brothers Trading Co')).toBe(1);
    expect(supplierOverlap('Kilang Roti Sinar', 'Roti Sinar Enterprise')).toBeGreaterThanOrEqual(0.6);
  });
});

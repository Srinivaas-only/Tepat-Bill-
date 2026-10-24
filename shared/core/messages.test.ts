import { describe, it, expect } from 'vitest';
import { draftMessage, waLink, toMsisdn, type MessageInput } from './messages';

const base: MessageInput = {
  lang: 'ms', shopName: 'Kedai Runcit Maju', supplierName: 'Borong Ali', invoiceNo: 'INV-2291', invoiceDate: '20/10/2026',
  poNo: 'PO-2610-004', evidenceUrl: 'https://tepat.example/e/abc123',
  lines: [{ type: 'short_qty', item: 'Milo 1kg', billedQty: 10, receivedQty: 8, missingQty: 2, amountSen: 9000, request: 'deduct' }],
};

describe('draftMessage', () => {
  it('BM shortage message carries PO, invoice, date, item, qty, RM, request and evidence link', () => {
    expect(draftMessage(base)).toBe([
      'Salam sejahtera Borong Ali, ini Kedai Runcit Maju.',
      'Merujuk invois INV-2291 bertarikh 20/10/2026 (pesanan PO-2610-004):',
      '• Milo 1kg: dalam invois 10, diterima 8. Kurang 2 unit = RM90.00.',
      'Mohon tolak jumlah ini daripada invois.',
      'Bukti (gambar & dokumen): https://tepat.example/e/abc123',
      'Terima kasih.',
    ].join('\n'));
  });
  it('EN price change states the agreed price', () => {
    const m = draftMessage({ ...base, lang: 'en', lines: [{ type: 'price_change', item: 'Gula 1kg', invoiceUnitSen: 320, agreedUnitSen: 280,
      pricedQty: 50, amountSen: 2000, request: 'agreed_price' }] });
    expect(m).toContain('agreed price RM2.80/unit, for 50 units = difference RM20.00.');
    expect(m).toContain('Please charge the agreed price.');
  });
  it('multiple lines add a total; requests are not repeated', () => {
    const m = draftMessage({ ...base, lines: [base.lines[0], { ...base.lines[0], item: 'Nescafe', amountSen: 1500 }] });
    expect(m).toContain('Jumlah: RM105.00.');
    expect(m.match(/Mohon tolak/g)).toHaveLength(1);
  });
  it('no demands or legal wording', () => {
    for (const lang of ['ms', 'en'] as const) {
      const m = draftMessage({ ...base, lang }).toLowerCase();
      for (const w of ['legal', 'mahkamah', 'court', 'lawyer', 'peguam', 'must', 'wajib', 'immediately', 'segera']) expect(m).not.toContain(w);
    }
  });
});

describe('WhatsApp link', () => {
  it('normalises Malaysian numbers', () => {
    expect(toMsisdn('012-345 6789')).toBe('60123456789');
    expect(toMsisdn('+60 11-2345 6789')).toBe('601123456789');
    expect(toMsisdn('12345')).toBeUndefined();
  });
  it('encodes BM text with newlines; stays well under 2000 chars', () => {
    const url = waLink(draftMessage(base), '012-345 6789');
    expect(url.startsWith('https://wa.me/60123456789?text=')).toBe(true);
    expect(decodeURIComponent(url.split('?text=')[1])).toBe(draftMessage(base));
    expect(url).toContain('%0A');
    expect(url.length).toBeLessThan(2000);
  });
  it('no number -> contact picker link', () => expect(waLink('hi')).toBe('https://wa.me/?text=hi'));
});

describe('price reference wording (audit: history is not agreement)', () => {
  const line = (source?: 'agreed' | 'po' | 'last_invoice') => ({ type: 'price_change' as const, item: 'Gula 1kg', invoiceUnitSen: 320, agreedUnitSen: 280, pricedQty: 50, amountSen: 2000, request: 'deduct' as const, baselineSource: source });
  it('agreed or unset keeps the agreed-price wording', () => {
    for (const src of [undefined, 'agreed' as const]) expect(draftMessage({ ...base, lang: 'ms', lines: [line(src)] })).toContain('harga yang dipersetujui RM2.80/unit');
  });
  it('a PO or previous-invoice reference is never called agreed', () => {
    expect(draftMessage({ ...base, lang: 'ms', lines: [line('last_invoice')] })).toContain('harga invois sebelum ini RM2.80/unit');
    expect(draftMessage({ ...base, lang: 'en', lines: [line('po')] })).toContain('order (PO) price RM2.80/unit');
    expect(draftMessage({ ...base, lang: 'en', lines: [line('last_invoice')] })).not.toContain('agreed price');
  });
});

describe('closing request for a non-agreed price reference', () => {
  it('does not ask to charge the "agreed" price when the reference is only history', () => {
    const l = { type: 'price_change' as const, item: 'Gula 1kg', invoiceUnitSen: 320, agreedUnitSen: 280, pricedQty: 50, amountSen: 2000, request: 'agreed_price' as const, baselineSource: 'last_invoice' as const };
    const m = draftMessage({ ...base, lang: 'en', lines: [l] });
    expect(m).not.toContain('agreed price'); expect(m).toContain('Please deduct');
    expect(draftMessage({ ...base, lang: 'en', lines: [{ ...l, baselineSource: 'agreed' }] })).toContain('Please charge the agreed price.');
  });
});

// Reconciles fixtures/ (demo documents + seed) with the rules engine. If the demo story drifts, this fails.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ExtractedDoc, linesToSen } from './extract';
import { detectFlags, normalise, type PoLine, type PriceList } from './rules';
import { supplierLedger, transition, needsReminder, type Flag, type Invoice } from './ledger';

const FX = join(__dirname, '..', '..', 'fixtures');
const seed = JSON.parse(readFileSync(join(FX, 'seed.json'), 'utf8'));
const expected = (f: string) => ExtractedDoc.parse(JSON.parse(readFileSync(join(FX, 'docs', `${f}.expected.json`), 'utf8')));
const DAY = 86_400_000, NOW = Date.UTC(2026, 9, 22, 4);
const ago = (d?: number) => (d === undefined ? undefined : NOW - d * DAY);

function seedLedgerInputs() {
  const invoices: Invoice[] = seed.invoices.map((i: any) => ({ id: i.id, supplierId: i.supplierId, poId: i.poId, invoiceNo: i.invoiceNo,
    totalSen: i.totalSen, issuedAt: ago(i.daysAgo)!, payment: i.payment, paidAt: ago(i.paidDaysAgo) }));
  const flags: Flag[] = seed.flags.map((f: any) => ({ ...f, openedAt: ago(f.openedDaysAgo), sentAt: ago(f.sentDaysAgo), settledAt: ago(f.settledDaysAgo), photoIds: [] }));
  return { invoices, flags };
}

describe('fixture documents', () => {
  it.each(['po_notebook_borong_ali', 'invoice_borong_ali_INV-2291', 'bon_signed_DO-5512', 'po_whatsapp_kilang_roti_sinar',
    'invoice_kilang_roti_sinar_0118', 'invoice_foreign_GZ-2026-088'])('%s matches the extraction schema with boxes on every line', f => {
    const d = expected(f);
    expect(d.lines.length).toBeGreaterThan(0);
    for (const l of d.lines) { expect(l.box_2d).toBeDefined(); const [y0, x0, y1, x1] = l.box_2d!; expect(y1).toBeGreaterThan(y0); expect(x1).toBeGreaterThan(x0); }
  });
  it('invoice totals add up', () => {
    for (const f of ['invoice_borong_ali_INV-2291', 'invoice_kilang_roti_sinar_0118', 'invoice_foreign_GZ-2026-088']) {
      const d = expected(f);
      const sum = linesToSen(d).reduce((s, l) => s + l.qty * l.unitPriceSen!, 0);
      expect(sum).toBe(Math.round(Number(d.totalAmount) * 100));
    }
  });
});

describe('live demo story (INV-2291 against PO-2610-004)', () => {
  const po: PoLine[] = seed.purchaseOrders.find((p: any) => p.id === 'po_004').lines;
  const invoice = linesToSen(expected('invoice_borong_ali_INV-2291')).map(l => ({ ...l, unitPriceSen: l.unitPriceSen! }));
  const priceList: PriceList = seed.priceList.sup_ali;
  const flags = detectFlags({ supplierId: 'sup_ali', po, invoice, received: seed.demo.staffTypesReceived, priceList, aliases: {} });

  it('raises exactly the two expected flags: Maggi short RM90.00, Gula +RM0.40 x 50 = RM20.00', () => {
    expect(flags.map(f => ({ type: f.type, sku: f.sku, amountSen: f.amountSen }))).toEqual(
      seed.demo.expectedFlags.map((f: any) => ({ type: f.type, sku: f.sku, amountSen: f.amountSen })));
    expect(flags[0].invoiceLineId).toBe('L1');
    expect(flags[1]).toMatchObject({ baselineSource: 'last_invoice', baselineUnitSen: 280, invoiceUnitSen: 320 });
  });
  it('Borong Ali owed: supplier credit applied on upload, then deduction settles', () => {
    const { invoices, flags: sf } = seedLedgerInputs();
    const live: Invoice = { id: 'inv_2291', supplierId: 'sup_ali', poId: 'po_004', invoiceNo: 'INV-2291', totalSen: 99390, issuedAt: NOW, payment: 'on_credit' };
    const l1 = supplierLedger('sup_ali', [...invoices, live], sf);
    expect(l1.owedSen).toBe(seed.demo.expectedBorongAliOwedAfterUpload.owedSen);
    expect(l1.rows.find(r => r.id === 'inv_2291')!.creditAppliedSen).toBe(seed.demo.expectedBorongAliOwedAfterUpload.creditAppliedSen);
    const short: Flag = { id: 'f', supplierId: 'sup_ali', invoiceId: 'inv_2291', poId: 'po_004', invoiceLineId: 'L1', type: 'short_qty',
      amountSen: 9000, status: 'proposed', photoIds: [] };
    const settled = transition(transition(short, 'open', NOW), 'settled', NOW + 60_000, 'deducted');
    expect(supplierLedger('sup_ali', [...invoices, live], [...sf, settled]).owedSen).toBe(seed.demo.expectedBorongAliOwedAfterDeductSettled.owedSen);
  });
});

describe('seed consistency', () => {
  it('invoice totals equal their lines', () => {
    for (const i of seed.invoices) expect(i.lines.reduce((s: number, l: any) => s + l.qty * l.unitPriceSen, 0)).toBe(i.totalSen);
  });
  it('seeded flags agree with the rules engine', () => {
    for (const i of seed.invoices) {
      const po = seed.purchaseOrders.find((p: any) => p.id === i.poId).lines;
      const lastBefore: PriceList = i.id === 'inv_2207' ? {} : seed.priceList[i.supplierId];
      const got = detectFlags({ supplierId: i.supplierId, po, invoice: i.lines, received: i.received, priceList: lastBefore, aliases: seed.aliases })
        .map(f => ({ line: f.invoiceLineId, type: f.type, amountSen: f.amountSen }));
      const want = seed.flags.filter((f: any) => f.invoiceId === i.id).map((f: any) => ({ line: f.invoiceLineId, type: f.type, amountSen: f.amountSen }));
      const key = (x: any) => x.line + x.type;
      expect(got.sort((a, b) => key(a).localeCompare(key(b)))).toEqual(want.sort((a: any, b: any) => key(a).localeCompare(key(b))));
    }
  });
  it('Lim Brothers: disputed stays owed, reminder due; Guangzhou is foreign', () => {
    const { invoices, flags } = seedLedgerInputs();
    expect(supplierLedger('sup_lim', invoices, flags)).toMatchObject({ owedSen: 59370, disputedSen: 1250, payNowSen: 58120 });
    expect(flags.filter(f => needsReminder(f, NOW)).map(f => f.id).sort()).toEqual(['flg_l1', 'flg_l2']);
    expect(seed.suppliers.find((s: any) => s.id === 'sup_gz').isForeign).toBe(true);
  });
  it('aliases use the normalised key', () => {
    for (const t of Object.values(seed.aliases) as Record<string, string>[]) for (const k of Object.keys(t)) expect(normalise(k)).toBe(k);
  });
});

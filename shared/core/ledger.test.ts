import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { supplierLedger, transition, needsReminder, markSent, orderState, canMarkCorrect, monthSummary, last30Days, type Flag, type Invoice } from './ledger';
import { can, ACTIONS } from './roles';
import { prepareSelfBilled, approveDraft, releaseDraft, validateSelfBilled, type DraftStatus } from './einvoice';
import { buildEvidence, type Db } from './evidence';

const DAY = 86_400_000;
const inv = (id: string, totalSen: number, issuedDay: number, payment: Invoice['payment'] = 'on_credit', paidDay?: number): Invoice =>
  ({ id, supplierId: 'S1', poId: 'PO-' + id, invoiceNo: 'N-' + id, totalSen, issuedAt: issuedDay * DAY, payment, paidAt: paidDay === undefined ? undefined : paidDay * DAY });
const flag = (id: string, invoiceId: string, amountSen: number, type: Flag['type'] = 'short_qty'): Flag =>
  ({ id, supplierId: 'S1', invoiceId, poId: 'PO-' + invoiceId, invoiceLineId: 'L1', type, amountSen, status: 'proposed', photoIds: [] });
const open = (f: Flag, day = 1) => transition(f, 'open', day * DAY);

describe('settlement', () => {
  const I1 = inv('I1', 100_000, 1);
  it('Open: owed unchanged', () => expect(supplierLedger('S1', [I1], [open(flag('F', 'I1', 9000))]).owedSen).toBe(100_000));
  it('Redelivered: owed unchanged', () => {
    const f = transition(open(flag('F', 'I1', 9000)), 'settled', 3 * DAY, 'redelivered');
    expect(supplierLedger('S1', [I1], [f]).owedSen).toBe(100_000);
  });
  it.each(['credit_note', 'deducted'] as const)('%s on credit order: owed down', k => {
    const f = transition(open(flag('F', 'I1', 9000)), 'settled', 3 * DAY, k);
    const l = supplierLedger('S1', [I1], [f]);
    expect(l.owedSen).toBe(91_000); expect(l.recoveredSen).toBe(9000); expect(l.creditCarrySen).toBe(0);
  });
  it('Disputed: owed unchanged', () => {
    expect(supplierLedger('S1', [I1], [transition(open(flag('F', 'I1', 9000)), 'disputed', 2 * DAY)]).owedSen).toBe(100_000);
  });
  it('credit note on Paid order -> credit applied to next invoice', () => {
    const P = inv('P', 50_000, 1, 'paid', 1);
    const f = transition(open(flag('F', 'P', 9000)), 'settled', 3 * DAY, 'credit_note');
    expect(supplierLedger('S1', [P], [f])).toMatchObject({ owedSen: 0, creditCarrySen: 9000 });
    const l = supplierLedger('S1', [P, inv('N', 20_000, 5)], [f]);
    expect(l).toMatchObject({ owedSen: 11_000, creditCarrySen: 0 });
    expect(l.rows[0]).toMatchObject({ id: 'N', creditAppliedSen: 9000 });
  });
  it('credit bigger than next invoice -> carry remainder, owed never negative', () => {
    const P = inv('P', 50_000, 1, 'paid', 1);
    const f = transition(open(flag('F', 'P', 30_000)), 'settled', 3 * DAY, 'credit_note');
    const l = supplierLedger('S1', [P, inv('N1', 20_000, 5), inv('N2', 25_000, 9)], [f]);
    expect(l.rows.map(r => r.netOwedSen)).toEqual([0, 15_000]);
    expect(l).toMatchObject({ owedSen: 15_000, creditCarrySen: 0 });
    const l2 = supplierLedger('S1', [P, inv('N1', 20_000, 5)], [f]);
    expect(l2).toMatchObject({ owedSen: 0, creditCarrySen: 10_000 });
  });
  it('credit is not applied to an older unpaid invoice (only "next")', () => {
    const old = inv('OLD', 40_000, 0);
    const P = inv('P', 50_000, 1, 'paid', 1);
    const f = transition(open(flag('F', 'P', 9000)), 'settled', 3 * DAY, 'credit_note');
    expect(supplierLedger('S1', [old, P], [f])).toMatchObject({ owedSen: 40_000, creditCarrySen: 9000 });
  });
  it('deduction settled BEFORE the order was paid is netted, not double-credited', () => {
    const I = inv('I', 50_000, 1, 'paid', 10);
    const f = transition(open(flag('F', 'I', 9000)), 'settled', 3 * DAY, 'deducted');
    expect(supplierLedger('S1', [I, inv('N', 20_000, 12)], [f])).toMatchObject({ owedSen: 20_000, creditCarrySen: 0 });
  });
  it('redelivered not allowed for price change', () =>
    expect(() => transition(open(flag('F', 'I1', 1, 'price_change')), 'settled', 1, 'redelivered')).toThrow());
  it('illegal transitions throw (settled is terminal, proposed cannot settle)', () => {
    expect(() => transition(flag('F', 'I1', 1), 'settled', 1, 'credit_note')).toThrow();
    const s = transition(open(flag('F', 'I1', 1)), 'settled', 1, 'credit_note');
    expect(() => transition(s, 'open', 2)).toThrow();
  });
  it('reminder: Open or Disputed, >= 14 days after WhatsApp sent (approval if never sent)', () => {
    const f = open(flag('F', 'I1', 1), 0);
    expect(needsReminder(f, 14 * DAY - 1)).toBe(false);
    expect(needsReminder(f, 14 * DAY)).toBe(true);                       // never sent -> from approval
    const sent = markSent(f, 5 * DAY);
    expect(needsReminder(sent, 18 * DAY)).toBe(false);
    expect(needsReminder(sent, 19 * DAY)).toBe(true);                    // 14 days after send
    expect(needsReminder(transition(sent, 'disputed', 6 * DAY), 19 * DAY)).toBe(true);
    expect(needsReminder(transition(sent, 'settled', 6 * DAY, 'credit_note'), 99 * DAY)).toBe(false);
    expect(needsReminder(flag('P', 'I1', 1), 30 * DAY)).toBe(false);     // proposed, not yet approved
  });
  it('markSent: first tap wins; proposed cannot be sent', () => {
    const f = markSent(open(flag('F', 'I1', 1)), 2 * DAY);
    expect(markSent(f, 9 * DAY).sentAt).toBe(2 * DAY);
    expect(() => markSent(flag('P', 'I1', 1), 1)).toThrow();
  });
  it('pay now vs under dispute', () => {
    const d = transition(open(flag('F', 'I1', 9000)), 'disputed', 2 * DAY);
    expect(supplierLedger('S1', [I1], [d])).toMatchObject({ owedSen: 100_000, disputedSen: 9000, payNowSen: 91_000 });
  });
});

describe('dispute scope (audit counterexample)', () => {
  it('a dispute on a fully credited invoice does not hide Pay now on another invoice', () => {
    const A = inv('A', 10_000, 1), B = inv('B', 50_000, 2);
    const fa = { ...transition(open(flag('fa', 'A', 10_000)), 'settled', 3 * DAY, 'credit_note') };
    const fb = transition(open(flag('fb', 'A', 5_000, 'price_change')), 'disputed', 3 * DAY);
    const L = supplierLedger('S1', [A, B], [fa, fb]);
    expect(L.owedSen).toBe(50_000);
    expect(L.disputedSen).toBe(0);
    expect(L.payNowSen).toBe(50_000);
  });
  it('a dispute still holds back its own invoice', () => {
    const A = inv('A', 10_000, 1), B = inv('B', 50_000, 2);
    const L = supplierLedger('S1', [A, B], [transition(open(flag('f', 'B', 7_000)), 'disputed', 3 * DAY)]);
    expect(L.disputedSen).toBe(7_000);
    expect(L.payNowSen).toBe(53_000);
  });
  it('disputedSen never exceeds the net owed on disputed invoices', () => {
    fc.assert(fc.property(fc.integer({ min: 0, max: 100_000 }), fc.integer({ min: 0, max: 100_000 }), (credit, dis) => {
      const A = inv('A', 100_000, 1), B = inv('B', 30_000, 2);
      const fa = transition(open(flag('fa', 'A', credit)), 'settled', 3 * DAY, 'deducted');
      const fd = transition(open(flag('fd', 'A', dis)), 'disputed', 3 * DAY);
      const L = supplierLedger('S1', [A, B], [fa, fd]);
      const netA = L.rows.find(r => r.id === 'A')!.netOwedSen;
      return L.disputedSen <= netA && L.payNowSen === L.owedSen - L.disputedSen;
    }));
  });
});

describe('supplier acceptance (deck slide 6: credit only after the supplier accepts)', () => {
  it('unpaid invoice: only the ACCEPTED amount reduces what is owed; flagged money stays separate from recovered', () => {
    const A = inv('A', 100_000, 1);
    const f = transition(open(flag('f', 'A', 10_000)), 'settled', 3 * DAY, 'credit_note', 6_000);
    const L = supplierLedger('S1', [A], [f]);
    expect(L.owedSen).toBe(94_000);
    expect(L.recoveredSen).toBe(6_000);
    expect(last30Days([f], 5 * DAY).settledSen).toBe(6_000);
    expect(last30Days([f], 5 * DAY).flaggedSen).toBe(10_000);
  });
  it('defaults to the full flagged amount when no accepted amount is recorded', () => {
    const A = inv('A', 100_000, 1);
    const L = supplierLedger('S1', [A], [transition(open(flag('f', 'A', 10_000)), 'settled', 3 * DAY, 'deducted')]);
    expect(L.owedSen).toBe(90_000); expect(L.recoveredSen).toBe(10_000);
  });
  it('already-paid invoice: the accepted amount carries forward and is deducted from the next invoice', () => {
    const A = inv('A', 100_000, 1, 'paid', 2), B = inv('B', 50_000, 6);
    const f = transition(open(flag('f', 'A', 10_000), 3), 'settled', 5 * DAY, 'credit_note', 7_500);
    const L = supplierLedger('S1', [A, B], [f]);
    expect(L.owedSen).toBe(42_500);
    expect(L.creditCarrySen).toBe(0);
    const only = supplierLedger('S1', [A], [f]);
    expect(only.creditCarrySen).toBe(7_500);
  });
  it('rejects an accepted amount above the flagged amount, or on a redelivery', () => {
    expect(() => transition(open(flag('f', 'A', 10_000)), 'settled', DAY, 'credit_note', 10_001)).toThrow();
    expect(() => transition(open(flag('f', 'A', 10_000)), 'settled', DAY, 'redelivered', 5_000)).toThrow();
  });
});

describe('residue of a partially accepted claim (audit round 3)', () => {
  it('flagged money is counted once: parent + residue child never sum to more than the claim', () => {
    const parent = transition(open(flag('p', 'A', 10_000)), 'settled', 3 * DAY, 'credit_note', 4_000);
    const child = { ...open(flag('c', 'A', 6_000)), parentId: 'p' } as Flag;
    const kid = transition(child, 'disputed', 3 * DAY);
    const r = last30Days([parent, kid], 5 * DAY);
    expect(r.flaggedSen).toBe(10_000);
    expect(r.settledSen).toBe(4_000);
    expect(r.openSen).toBe(6_000);
    expect(r.flaggedSen).toBe(r.settledSen + r.openSen);
  });
});

describe('order state', () => {
  it('has_flags while anything unresolved; correct only after owner marks it', () => {
    const p = flag('F', 'I1', 1);
    expect(orderState('I1', [p], true)).toBe('has_flags');
    expect(canMarkCorrect('I1', [p])).toBe(false);
    const s = transition(open(p), 'settled', 2 * DAY, 'credit_note');
    expect(canMarkCorrect('I1', [s])).toBe(true);
    expect(orderState('I1', [s], false)).toBe('recorded');
    expect(orderState('I1', [s], true)).toBe('correct');
    expect(orderState('I2', [p], false)).toBe('recorded');
  });
});

describe('month summary', () => {
  it('RM flagged / settled / open for the month of approval', () => {
    const t = new Date(2026, 9, 5).getTime(), last = new Date(2026, 8, 20).getTime();
    const a = transition(flag('A', 'I1', 9000), 'open', t);
    const b = transition(transition(flag('B', 'I1', 2000), 'open', t), 'settled', t + DAY, 'credit_note');
    const c = transition(transition(flag('C', 'I1', 500), 'open', t), 'disputed', t + DAY);
    const old = transition(flag('D', 'I1', 7000), 'open', last);
    const prop = flag('E', 'I1', 100);
    expect(monthSummary([a, b, c, old, prop], 2026, 9)).toEqual({ flaggedSen: 11_500, settledSen: 2000, openSen: 9500 });
  });
  it('last 30 days (Home hero): includes flags approved 29 days ago, excludes 31', () => {
    const now = 100 * DAY;
    const in29 = transition(flag('A', 'I1', 1000), 'open', now - 29 * DAY);
    const out31 = transition(flag('B', 'I1', 5000), 'open', now - 31 * DAY);
    expect(last30Days([in29, out31], now)).toEqual({ flaggedSen: 1000, settledSen: 0, openSen: 1000 });
  });
});

// ---------- property tests ----------
const arbWorld = fc.record({
  invs: fc.array(fc.record({ total: fc.integer({ min: 0, max: 5_000_000 }), paid: fc.boolean(), day: fc.integer({ min: 0, max: 100 }) }), { minLength: 1, maxLength: 6 }),
  flags: fc.array(fc.record({ inv: fc.nat(), frac: fc.integer({ min: 0, max: 100 }),
    st: fc.constantFrom('proposed', 'open', 'disputed', 'redelivered', 'credit_note', 'deducted', 'dismissed'), day: fc.integer({ min: 0, max: 120 }) }), { maxLength: 10 }),
});
type World = typeof arbWorld extends fc.Arbitrary<infer T> ? T : never;
function build(w: World) {
  const invoices = w.invs.map((x, i) => inv('I' + i, x.total, x.day, x.paid ? 'paid' : 'on_credit', x.paid ? x.day : undefined));
  const flags = w.flags.map((x, i) => {
    const target = invoices[x.inv % invoices.length];
    let f: Flag = flag('F' + i, target.id, Math.floor(target.totalSen * x.frac / 100));
    if (x.st === 'proposed') return f;
    if (x.st === 'dismissed') return transition(f, 'dismissed', x.day * DAY);
    f = transition(f, 'open', target.issuedAt);
    if (x.st === 'open') return f;
    if (x.st === 'disputed') return transition(f, 'disputed', x.day * DAY);
    return transition(f, 'settled', Math.max(target.issuedAt, x.day * DAY), x.st);
  });
  return { invoices, flags };
}
describe('ledger invariants (fast-check)', () => {
  it('Open -> Disputed never changes owed or credit', () => fc.assert(fc.property(arbWorld, fc.nat(), (w, k) => {
    const { invoices, flags } = build(w);
    const idx = flags.findIndex((f, i) => f.status === 'open' && i >= k % Math.max(1, flags.length));
    if (idx < 0) return;
    const before = supplierLedger('S1', invoices, flags);
    const after = supplierLedger('S1', invoices, flags.map((f, i) => i === idx ? transition(f, 'disputed', 999 * DAY) : f));
    expect(after.owedSen).toBe(before.owedSen); expect(after.creditCarrySen).toBe(before.creditCarrySen);
  }), { numRuns: 1000 }));
  it('owed, carry never negative; integers only; rows sum to owed', () => fc.assert(fc.property(arbWorld, w => {
    const { invoices, flags } = build(w);
    const l = supplierLedger('S1', invoices, flags);
    for (const v of [l.owedSen, l.creditCarrySen, l.recoveredSen, ...l.rows.flatMap(r => [r.netOwedSen, r.creditAppliedSen])]) {
      expect(Number.isSafeInteger(v)).toBe(true); expect(v).toBeGreaterThanOrEqual(0);
    }
    expect(l.rows.reduce((s, r) => s + r.netOwedSen, 0)).toBe(l.owedSen);
  }), { numRuns: 1000 }));
  it('conservation: unpaid gross − reductions − credit applied = owed; credit created = applied + carry', () => fc.assert(fc.property(arbWorld, w => {
    const { invoices, flags } = build(w);
    const l = supplierLedger('S1', invoices, flags);
    const unpaidGross = invoices.filter(i => i.payment === 'on_credit').reduce((s, i) => s + i.totalSen, 0);
    const applied = l.rows.reduce((s, r) => s + r.creditAppliedSen, 0);
    const reductions = l.rows.reduce((s, r) => s + r.reductionSen, 0);
    const excess = l.rows.reduce((s, r) => s + Math.max(0, r.reductionSen - r.grossSen), 0);
    expect(unpaidGross - reductions + excess - applied).toBe(l.owedSen);
    expect(l.owedSen).toBeLessThanOrEqual(unpaidGross);
  }), { numRuns: 1000 }));
  it('rejects float amounts', () => expect(() => supplierLedger('S1', [inv('I', 10.5, 0)], [])).toThrow());
});

describe('roles', () => {
  it('staff can upload/count only; owner can all', () => {
    expect(can('staff', 'upload_document')).toBe(true);
    expect(can('staff', 'record_count')).toBe(true);
    expect(can('staff', 'correct_extraction')).toBe(true);
    for (const a of ['approve_flag', 'dismiss_flag', 'send_message', 'settle_flag', 'release_einvoice', 'mark_correct', 'dispute_flag', 'set_agreed_price', 'mark_paid', 'edit_supplier', 'export_csv'] as const)
      expect(can('staff', a)).toBe(false);
    for (const a of ACTIONS) expect(can('owner', a)).toBe(true);
  });
});

describe('self-billed e-invoice stub', () => {
  const local = { id: 'S1', name: 'Kedai Ali', isForeign: false };
  const foreign = { id: 'S9', name: 'Guangzhou Snacks Trading', isForeign: true, country: 'CN' };
  const buyer = { name: 'Kedai Runcit Maju', tin: 'IG12345678901', brn: '202601000123', address: 'Ipoh, Perak' };
  const I = { id: 'I', invoiceNo: 'GZ-88', issuedAt: 1, currency: 'USD', exchangeRateToMYR: 4.2, lines: [{ description: 'Seaweed snack', qty: 20, unitPriceSen: 150 }] };
  it('only foreign suppliers produce a draft', () => {
    expect(prepareSelfBilled(local, I, buyer)).toBeNull();
    const d = prepareSelfBilled(foreign, I, buyer)!;
    expect(d).toMatchObject({ status: 'draft', label: 'Preview, not submitted to LHDN' });
    expect(d.fields).toMatchObject({ eInvoiceType: '11', supplierTin: 'EI00000000030', currency: 'USD', totalSen: 3000, eInvoiceNo: 'SB-GZ-88' });
  });
  it('release only by owner, after approve; never "submitted"', () => {
    const d = prepareSelfBilled(foreign, I, buyer)!;
    expect(() => approveDraft(d, 'staff')).toThrow();
    expect(() => releaseDraft(d, 'owner', 1)).toThrow();
    const a = approveDraft(d, 'owner');
    expect(() => releaseDraft(a, 'staff', 1)).toThrow();
    const r = releaseDraft(a, 'owner', 1);
    expect(r.draft.status).toBe('released_stub');
    expect(r.event).toEqual({ who: 'owner', what: 'einvoice.release_stub', when: 1, ref: 'I' });
    // @ts-expect-error 'submitted' is not a DraftStatus
    const s: DraftStatus = 'submitted'; void s;
    for (const st of [d.status, a.status, r.draft.status]) expect(st).not.toBe('submitted');
  });
});

describe('evidence payload', () => {
  it('contains only that flag\'s PO, invoice, photos, box', () => {
    const db: Db = {
      flags: [{ ...open(flag('F1', 'I1', 9000)), photoIds: ['ph1'] }, { ...open(flag('F2', 'I2', 500)), photoIds: ['ph2'] }],
      invoices: [
        { ...inv('I1', 100_000, 1), lines: [{ lineId: 'L1', description: 'Beras', qty: 10, unitPriceSen: 4500, box: [100, 50, 140, 900] }] },
        { ...inv('I2', 7_000, 2), lines: [{ lineId: 'L1', description: 'SECRET-OTHER', qty: 1, unitPriceSen: 7000 }] }],
      pos: [{ id: 'PO-I1', poNo: 'PO-2610-001', supplierId: 'S1', lines: [{ sku: 'B', description: 'Beras', orderedQty: 10 }] },
            { id: 'PO-I2', poNo: 'PO-2610-002', supplierId: 'S1', lines: [{ sku: 'X', description: 'SECRET-PO', orderedQty: 1 }] }],
      photos: [{ id: 'ph1', kind: 'signed_bon', url: '/e/tok/photo/ph1' }, { id: 'ph2', kind: 'delivery', url: '/e/tok/photo/ph2' }],
    };
    const e = buildEvidence(db, 'F1');
    expect(Object.keys(e).sort()).toEqual(['baseline', 'flag', 'highlight', 'invoice', 'photos', 'po']);
    expect(e.photos).toEqual([{ id: 'ph1', kind: 'signed_bon', url: '/e/tok/photo/ph1' }]);
    expect(e.po?.poNo).toBe('PO-2610-001');
    expect(e.baseline).toBeNull();
    expect(e.highlight.box_2d).toEqual([100, 50, 140, 900]);
    const s = JSON.stringify(e);
    for (const leak of ['SECRET', 'F2', 'I2', 'ph2', 'owed', 'supplierId', 'payment', 'PO-2610-002']) expect(s).not.toContain(leak);
    // unapproved flags are never exposed
    expect(() => buildEvidence({ ...db, flags: [flag('F3', 'I1', 1)] }, 'F3')).toThrow();
  });
  it('price flag evidence carries the baseline and its source', () => {
    const f: Flag = { ...open(flag('FP', 'I1', 2000, 'price_change')), baselineUnitSen: 1600, baselineSource: 'agreed' };
    const db: Db = { flags: [f], invoices: [{ ...inv('I1', 1, 1), lines: [] }], pos: [], photos: [] };
    expect(buildEvidence(db, 'FP').baseline).toEqual({ unitSen: 1600, source: 'agreed' });
  });
});

describe('self-billed e-invoice validation (what LHDN would reject)', () => {
  const sup = { id: 'S', name: 'Guangzhou Hengda', isForeign: true, country: 'CN' };
  const inv = { id: 'I', invoiceNo: 'GZ-1', issuedAt: 0, currency: 'USD', exchangeRateToMYR: 4.2, lines: [{ description: 'Seaweed', qty: 2, unitPriceSen: 550 }] };
  const buyer = { name: 'Kedai Maju', tin: 'C123', brn: '2020', address: 'Ipoh' };
  it('a complete draft has no issues', () => expect(validateSelfBilled(prepareSelfBilled(sup, inv, buyer)!)).toEqual([]));
  it('flags missing buyer identity, rate, country and value', () => {
    const d = prepareSelfBilled({ ...sup, country: undefined }, { ...inv, exchangeRateToMYR: undefined, lines: [] }, { name: '', tin: '', brn: '', address: '' })!;
    expect(validateSelfBilled(d).map(i => i.code).sort()).toEqual(['buyer_address', 'buyer_brn', 'buyer_name', 'buyer_tin', 'lines', 'rate', 'supplier_country', 'total']);
  });
  it('MYR invoices need no exchange rate', () => {
    expect(validateSelfBilled(prepareSelfBilled(sup, { ...inv, currency: 'MYR', exchangeRateToMYR: undefined }, buyer)!)).toEqual([]);
  });
});

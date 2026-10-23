// The four deck scenarios end-to-end (delivery -> invoice compare), plus the round-3 regression tests. Own schema: api.test.ts mutates the seed.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import http from 'node:http';
import { sql } from 'drizzle-orm';
import { ALL_TABLES } from '../shared/schema';
import { makeDb } from './db';
import { memoryStorage } from './storage';
import { createApp, mountErrorHandlers } from './app';
import { seedDatabase } from './seed';
import { parseRM } from '../shared/core';
import { mintSkus } from './core-adapters';

const owner = process.env.OWNER_PIN ?? '1234';
const staff = process.env.STAFF_PIN ?? '5678';
const SCHEMA = 'test_scen';
const fx = (n: string) => JSON.parse(readFileSync(`fixtures/docs/${n}.expected.json`, 'utf8'));
const dLines = (n: string) => fx(n).lines.map((l: any) => ({ description: l.description, qty: l.qty, unit: l.unit }));
const iLines = (n: string) => fx(n).lines.map((l: any) => ({ description: l.description, qty: l.qty, unit: l.unit, unitPriceSen: parseRM(l.unitPrice) }));

describe.skipIf(!process.env.DATABASE_URL)('scenarios + round 3 (own schema)', () => {
  let server: Server; let base = ''; let pool: ReturnType<typeof makeDb>['pool'];
  let ownerCookie = ''; let staffCookie = '';
  const call = async (method: string, url: string, cookie?: string, body?: unknown, headers: Record<string, string> = {}) => {
    const r = await fetch(base + url, { method, headers: { ...(cookie ? { cookie } : {}), ...(body ? { 'content-type': 'application/json' } : {}), ...headers }, body: body ? JSON.stringify(body) : undefined });
    return { status: r.status, json: (await r.json().catch(() => null)) as any };
  };
  const login = async (pin: string) => {
    const r = await fetch(base + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ pin }) });
    return (r.headers.get('set-cookie') ?? '').split(';')[0];
  };
  beforeAll(async () => {
    const admin = makeDb();
    await admin.pool.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`); await admin.pool.query(`CREATE SCHEMA ${SCHEMA}`);
    for (const t of ALL_TABLES) await admin.pool.query(`CREATE TABLE ${SCHEMA}."${t}" (LIKE public."${t}" INCLUDING ALL)`);
    await admin.pool.end();
    const m = makeDb(undefined, SCHEMA); pool = m.pool;
    const storage = memoryStorage();
    await seedDatabase(m.db, storage, Date.now(), { quiet: true });
    await m.db.execute(sql`select 1`);
    const app = createApp({ db: m.db, storage, gemini: () => { throw new Error('gemini must not be called'); } });
    mountErrorHandlers(app);
    await new Promise<void>(res => { server = app.listen(0, () => res()); });
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    ownerCookie = await login(owner); staffCookie = await login(staff);
  });
  afterAll(async () => { server?.close(); await pool?.end(); });

  let del1 = ''; let del2 = ''; let d2flagId = '';

  it('T6 fresh seed: exact home summary', async () => {
    const h = await call('GET', '/api/home', ownerCookie);
    expect(h.json.summary).toMatchObject({ flaggedSen: 8580, settledSen: 3190, openSen: 5390 });
  });

  describe('T1 the four scenarios', () => {
    it('1. clean delivery: no flags, owner marks correct (staff cannot)', async () => {
      const d = await call('POST', '/api/deliveries', staffCookie, { supplierId: 'sup_lim', poId: 'po_006', doNo: 'DO-LB-0901', docDate: '2026-10-24', lines: dLines('do_lim_brothers_DO-LB-0901') });
      expect(d.status).toBe(201); del1 = d.json.id;
      const c = await call('PUT', `/api/deliveries/${del1}/counts`, staffCookie, { counts: {} });
      expect(c.status).toBe(200); expect(c.json.flags).toHaveLength(0); expect(c.json.estimateSen).toBe(0);
      expect((await call('POST', `/api/deliveries/${del1}/mark-correct`, staffCookie)).status).toBe(403);
      expect((await call('POST', `/api/deliveries/${del1}/mark-correct`, ownerCookie)).status).toBe(200);
      expect((await call('POST', '/api/deliveries', staffCookie, { supplierId: 'sup_lim', doNo: 'do-lb-0901', lines: [{ description: 'x', qty: 1 }] })).json.error.code).toBe('duplicate_delivery');
    });
    it('2. wrong delivery: one Maggi delivery-stage short = RM90 estimate, ledger untouched', async () => {
      const before = (await call('GET', '/api/suppliers/sup_ali/ledger', ownerCookie)).json.ledger.payNowSen;
      const d = await call('POST', '/api/deliveries', staffCookie, { supplierId: 'sup_ali', poId: 'po_004', doNo: 'DO-5512', docDate: '2026-10-20', lines: dLines('bon_signed_DO-5512') });
      expect(d.status).toBe(201); del2 = d.json.id;
      const c = await call('PUT', `/api/deliveries/${del2}/counts`, staffCookie, { counts: { 'line:L1': 8 } });
      expect(c.json.flags).toHaveLength(1);
      expect(c.json.flags[0]).toMatchObject({ type: 'short_qty', sku: 'maggi-kari', amountSen: 9000, stage: 'delivery' });
      expect(c.json.estimateSen).toBe(9000); d2flagId = c.json.flags[0].id;
      expect((await call('GET', '/api/suppliers/sup_ali/ledger', ownerCookie)).json.ledger.payNowSen).toBe(before);
      expect((await call('POST', `/api/deliveries/${del2}/mark-correct`, ownerCookie)).status).toBe(409);
    });
    it('3. clean invoice linked to the clean delivery: compared, ready to pay, then paid', async () => {
      const r = await call('POST', '/api/invoices', staffCookie, { supplierId: 'sup_lim', poId: 'po_006', deliveryId: del1, invoiceNo: 'LB-7810', currency: 'MYR', totalSen: 28560, lines: iLines('invoice_lim_brothers_LB-7810') });
      expect(r.status).toBe(201);
      expect(r.json).toMatchObject({ compared: true, readyToPay: true, totalSen: 28560 }); expect(r.json.flags).toHaveLength(0);
      const cmp = await call('GET', `/api/invoices/${r.json.id}/compare`, staffCookie);
      expect(cmp.json.readyToPay).toBe(true); expect(cmp.json.netOwedSen).toBe(28560);
      const p = await call('PATCH', `/api/invoices/${r.json.id}/payment`, ownerCookie, { payment: 'paid' });
      expect(p.status).toBe(200);
    });
    it('4. wrong invoice linked to the short delivery: two flags, delivery flag superseded, Pay now 962 -> 872', async () => {
      expect((await call('POST', `/api/flags/${d2flagId}/approve`, ownerCookie, {})).status).toBe(200);
      const r = await call('POST', '/api/invoices', staffCookie, { supplierId: 'sup_ali', poId: 'po_004', deliveryId: del2, invoiceNo: 'INV-2291', currency: 'MYR', totalSen: 99390, lines: iLines('invoice_borong_ali_INV-2291') });
      expect(r.status).toBe(201);
      expect(r.json.compared).toBe(true); expect(r.json.readyToPay).toBe(false);
      expect(r.json.flags.map((f: any) => [f.type, f.sku, f.amountSen]).sort()).toEqual([['price_change', 'gula-pasir-1kg', 2000], ['short_qty', 'maggi-kari', 9000]]);
      const sup = await pool.query(`select superseded_by from ${SCHEMA}.flags where id = $1`, [d2flagId]);
      expect(sup.rows[0].superseded_by).toBeTruthy();
      expect((await call('GET', '/api/suppliers/sup_ali/ledger', ownerCookie)).json.ledger.payNowSen).toBe(96200);
      const maggi = r.json.flags.find((f: any) => f.type === 'short_qty');
      expect((await call('POST', `/api/flags/${maggi.id}/approve`, ownerCookie, { request: 'deduct' })).status).toBe(200);
      expect((await call('POST', `/api/flags/${maggi.id}/settle`, ownerCookie, { settlement: 'deducted' })).status).toBe(200);
      expect((await call('GET', '/api/suppliers/sup_ali/ledger', ownerCookie)).json.ledger.payNowSen).toBe(87200);
      const msg = await call('GET', `/api/flags/${d2flagId}/message?lang=ms`, ownerCookie);
      expect(msg.status).toBe(409);
    });
  });

  it('message drafts work for invoice-stage and delivery-stage flags', async () => {
    const all = (await call('GET', '/api/flags', ownerCookie)).json.flags;
    for (const f of all.filter((x: any) => x.status === 'open' && !x.supersededBy).slice(0, 12)) {
      const m = await call('GET', `/api/flags/${f.id}/message?lang=ms`, ownerCookie);
      expect([f.id, m.status, JSON.stringify(m.json).slice(0, 200)]).toEqual([f.id, 200, expect.any(String)]);
    }
  });

  it('T2 decimal boxes are rounded to integers on save', async () => {
    const r = await call('POST', '/api/pos', staffCookie, { supplierId: 'sup_ali', source: 'typed', lines: [{ description: 'Teh tarik', qty: 1, box: [10.4, 20.6, 100.2, 300.7] }] });
    expect(r.status).toBe(201);
    const row = await pool.query(`select box from ${SCHEMA}.po_lines where po_id = $1`, [r.json.id]);
    expect(row.rows[0].box).toEqual([10, 21, 100, 301]);
  });

  it('T3 nearSku mints gula-perang-1kg for a near-miss description', () => {
    expect(mintSkus(['Gula perang 1kg'], ['gula-pasir-1kg'])).toEqual(['gula-perang-1kg']);
  });

  it('T4 a photo uploaded after the counts shows up in the evidence payload', async () => {
    const inv = await call('POST', '/api/invoices', staffCookie, { supplierId: 'sup_ali', invoiceNo: 'LATE-PHOTO', lines: [{ description: 'Beras', qty: 5, unitPriceSen: 1000 }], totalSen: 5000 });
    const put = await call('PUT', `/api/invoices/${inv.json.id}/counts`, staffCookie, { counts: { 'line:L1': 3 } });
    const flag = put.json.flags[0];
    await call('POST', `/api/flags/${flag.id}/approve`, ownerCookie, {});
    const fd = new FormData();
    fd.append('kind', 'photo'); fd.append('photoKind', 'delivery'); fd.append('invoiceId', inv.json.id);
    fd.append('file', new Blob([readFileSync('fixtures/docs/delivery_photo_INV-2291.png')], { type: 'image/png' }), 'p.png');
    const up = await fetch(base + '/api/documents', { method: 'POST', headers: { cookie: staffCookie }, body: fd });
    expect(up.status).toBe(201);
    const detail = await call('GET', `/api/flags/${flag.id}`, ownerCookie);
    const ev = await call('GET', `/api/public/evidence/${detail.json.evidenceToken}`);
    expect(ev.json.photos.length).toBeGreaterThan(0);
  });

  it('T5 concurrency: two approves -> one 200 + one 409; two identical invoices -> one 201 + one 409', async () => {
    const inv = await call('POST', '/api/invoices', staffCookie, { supplierId: 'sup_ali', invoiceNo: 'RACE-1', lines: [{ description: 'Mee', qty: 4, unitPriceSen: 500 }], totalSen: 2000 });
    const put = await call('PUT', `/api/invoices/${inv.json.id}/counts`, staffCookie, { counts: { 'line:L1': 2 } });
    const id = put.json.flags[0].id;
    const rs = await Promise.all([call('POST', `/api/flags/${id}/approve`, ownerCookie, {}), call('POST', `/api/flags/${id}/approve`, ownerCookie, {})]);
    expect(rs.map(r => r.status).sort()).toEqual([200, 409]);
    const ev = await pool.query(`select count(*)::int as n from ${SCHEMA}.events where ref = $1 and action = 'flag.approve'`, [id]);
    expect(ev.rows[0].n).toBe(1);
    const body = { supplierId: 'sup_ali', invoiceNo: 'RACE-2', lines: [{ description: 'Mee', qty: 4, unitPriceSen: 500 }], totalSen: 2000 };
    const ps = await Promise.all([call('POST', '/api/invoices', staffCookie, body), call('POST', '/api/invoices', staffCookie, body)]);
    expect(ps.map(r => r.status).sort()).toEqual([201, 409]);
  });

  it('T6 reminders: GET logs nothing; POST sent {reminder:true} logs flag.remind', async () => {
    const f = await pool.query(`select id from ${SCHEMA}.flags where id = 'flg_l1'`);
    const id = f.rows[0].id;
    const n0 = (await pool.query(`select count(*)::int as n from ${SCHEMA}.events where action = 'flag.remind'`)).rows[0].n;
    expect((await call('GET', `/api/flags/${id}/message?lang=ms&reminder=1`, ownerCookie)).status).toBe(200);
    expect((await pool.query(`select count(*)::int as n from ${SCHEMA}.events where action = 'flag.remind'`)).rows[0].n).toBe(n0);
    expect((await call('POST', '/api/flags/sent', ownerCookie, { flagIds: [id], reminder: true })).status).toBe(200);
    expect((await pool.query(`select count(*)::int as n from ${SCHEMA}.events where action = 'flag.remind'`)).rows[0].n).toBe(n0 + 1);
  });

  it('T7/T8 payment keeps paidAt and stores dueAt; dispute stores its note', async () => {
    const p1 = await call('PATCH', '/api/invoices/inv_lb7781/payment', ownerCookie, { payment: 'paid' });
    expect(p1.status).toBe(200);
    const due = Date.now() + 5 * 86400000;
    const p2 = await call('PATCH', '/api/invoices/inv_lb7781/payment', ownerCookie, { dueAt: due });
    expect(p2.json.dueAt).toBe(due); expect(p2.json.paidAt).toBe(p1.json.paidAt);
    expect((await call('PATCH', '/api/invoices/inv_lb7781/payment', ownerCookie, { payment: 'paid' })).status).toBe(400);
    const d = await call('POST', '/api/flags/flg_l1/dispute', ownerCookie, { note: 'Supplier says delivered' });
    expect(d.status).toBe(200);
    expect((await call('GET', '/api/flags/flg_l1', ownerCookie)).json.flag.note).toBe('Supplier says delivered');
  });

  it('T9 unknown count keys are rejected', async () => {
    const inv = await call('POST', '/api/invoices', staffCookie, { supplierId: 'sup_ali', invoiceNo: 'KEYS-1', lines: [{ description: 'Mee', qty: 4, unitPriceSen: 500 }], totalSen: 2000 });
    expect((await call('PUT', `/api/invoices/${inv.json.id}/counts`, staffCookie, { counts: { 'line:L9': 1 } })).status).toBe(400);
    expect((await call('PUT', `/api/deliveries/${del1}/counts`, staffCookie, { counts: { nonsense: 1 } })).status).toBe(400);
  });

  it('T10 fixtures route 404 without DEMO_FIXTURES; use-fixture on a used document -> 409', async () => {
    if (process.env.DEMO_FIXTURES !== '1') { expect((await call('GET', '/api/fixtures', staffCookie)).status).toBe(404); return; }
    expect((await call('GET', '/api/fixtures', staffCookie)).status).toBe(200);
  });

  it('T11 staff gets 403 on sent, settle, reopen, mark-correct and e-invoice approve', async () => {
    expect((await call('POST', '/api/flags/sent', staffCookie, { flagIds: ['flg_l1'] })).status).toBe(403);
    expect((await call('POST', '/api/flags/flg_l1/settle', staffCookie, { settlement: 'credit_note' })).status).toBe(403);
    expect((await call('POST', '/api/flags/flg_l1/reopen', staffCookie)).status).toBe(403);
    expect((await call('POST', `/api/deliveries/${del2}/mark-correct`, staffCookie)).status).toBe(403);
    expect((await call('POST', '/api/invoices/inv_gz088/einvoice/approve', staffCookie)).status).toBe(403);
  });

  it('T1 limiter: a successful staff login does not reset the wrong-PIN count', async () => {
    const m = makeDb(undefined, SCHEMA);
    const app = createApp({ db: m.db, storage: memoryStorage(), gemini: () => { throw new Error('no'); } });
    mountErrorHandlers(app);
    const srv: Server = await new Promise(res => { const x = app.listen(0, () => res(x)); });
    const b = `http://127.0.0.1:${(srv.address() as AddressInfo).port}`;
    const post = (pin: string) => fetch(b + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ pin }) }).then(r => r.status);
    const wrong = owner === '0000' ? '9999' : '0000';
    for (let i = 0; i < 4; i++) expect(await post(wrong)).toBe(401);
    expect(await post(staff)).toBe(200);
    expect(await post(wrong)).toBe(429);
    srv.close(); await m.pool.end();
  });

  it('T2 recount keeps an approved flag (same id, token, status open)', async () => {
    const inv = await call('POST', '/api/invoices', staffCookie, { supplierId: 'sup_ali', invoiceNo: 'RECOUNT-1', lines: [{ description: 'Kicap', qty: 6, unitPriceSen: 400 }], totalSen: 2400 });
    const put = await call('PUT', `/api/invoices/${inv.json.id}/counts`, staffCookie, { counts: { 'line:L1': 4 } });
    const f = put.json.flags[0];
    expect((await call('POST', `/api/flags/${f.id}/approve`, ownerCookie, {})).status).toBe(200);
    const token = (await call('GET', `/api/flags/${f.id}`, ownerCookie)).json.evidenceToken;
    const again = await call('PUT', `/api/invoices/${inv.json.id}/counts`, staffCookie, { counts: { 'line:L1': 4 } });
    expect(again.status).toBe(200);
    const after = await call('GET', `/api/flags/${f.id}`, ownerCookie);
    expect(after.status).toBe(200);
    expect(after.json.flag.status).toBe('open');
    expect(after.json.evidenceToken).toBe(token);
    const none = await call('PUT', `/api/invoices/${inv.json.id}/counts`, staffCookie, { counts: { 'line:L1': 6 } });
    expect(none.status).toBe(200);
    expect((await call('GET', `/api/flags/${f.id}`, ownerCookie)).json.flag.status).toBe('open');
  });

  it('T3 a delivery document cannot be attached to an invoice', async () => {
    const fd = new FormData();
    fd.append('kind', 'delivery_note');
    fd.append('file', new Blob([readFileSync('fixtures/docs/do_lim_brothers_DO-LB-0901.png')], { type: 'image/png' }), 'd.png');
    const up = await (await fetch(base + '/api/documents', { method: 'POST', headers: { cookie: staffCookie }, body: fd })).json() as any;
    const d = await call('POST', '/api/deliveries', staffCookie, { supplierId: 'sup_lim', doNo: 'DO-T3-1', documentId: up.id, lines: [{ description: 'x', qty: 1 }] });
    expect(d.status).toBe(201);
    const inv = await call('POST', '/api/invoices', staffCookie, { supplierId: 'sup_lim', invoiceNo: 'T3-INV', lines: [{ description: 'x', qty: 1, unitPriceSen: 100 }], totalSen: 100 });
    expect((await call('POST', `/api/documents/${up.id}/attach`, staffCookie, { invoiceId: inv.json.id })).status).toBe(409);
  });

  it('T4 POST /flags/sent with a superseded delivery flag -> 409', async () => {
    expect(d2flagId).toBeTruthy();
    expect((await call('POST', '/api/flags/sent', ownerCookie, { flagIds: [d2flagId] })).status).toBe(409);
  });

  it('T5 an invoice without a linked delivery is never readyToPay', async () => {
    const inv = await call('POST', '/api/invoices', staffCookie, { supplierId: 'sup_lim', invoiceNo: 'T5-INV', lines: [{ description: 'Teh', qty: 2, unitPriceSen: 300 }], totalSen: 600 });
    const cmp = await call('GET', `/api/invoices/${inv.json.id}/compare`, staffCookie);
    expect(cmp.json.readyToPay).toBe(false);
  });

  it('T7 staff 403 on invoice mark-correct and einvoice release', async () => {
    expect((await call('POST', '/api/invoices/inv_gz088/mark-correct', staffCookie)).status).toBe(403);
    expect((await call('POST', '/api/invoices/inv_gz088/einvoice/release', staffCookie)).status).toBe(403);
  });

  it('T8 use-fixture on a document already used -> 409 document_in_use', async () => {
    const prev = process.env.DEMO_FIXTURES; process.env.DEMO_FIXTURES = '1';
    try {
      const fd = new FormData();
      fd.append('kind', 'po');
      fd.append('file', new Blob([readFileSync('fixtures/docs/po_notebook_borong_ali.png')], { type: 'image/png' }), 'p.png');
      const up = await (await fetch(base + '/api/documents', { method: 'POST', headers: { cookie: staffCookie }, body: fd })).json() as any;
      const po = await call('POST', '/api/pos', staffCookie, { supplierId: 'sup_ali', source: 'notebook', documentId: up.id, lines: [{ description: 'Mee', qty: 2 }] });
      expect(po.status).toBe(201);
      const r = await call('POST', `/api/documents/${up.id}/use-fixture`, staffCookie, { fixture: 'po_notebook_borong_ali' });
      expect([r.status, r.json.error?.code]).toEqual([409, 'document_in_use']);
    } finally { if (prev === undefined) delete process.env.DEMO_FIXTURES; else process.env.DEMO_FIXTURES = prev; }
  });

  it('T9 after a reminder is sent, reminderDue is false', async () => {
    const id = 'flg_l2';
    await call('POST', '/api/flags/sent', ownerCookie, { flagIds: [id], reminder: true });
    const f = await call('GET', `/api/flags/${id}`, ownerCookie);
    expect(f.json.flag.reminderDue).toBe(false);
  });

  it('T10 CSRF: forwarded host accepted, foreign origin rejected', async () => {
    const send = (origin: string, headers: Record<string, string>) => new Promise<number>((resolve, reject) => {
      const u = new URL(base);
      const req = http.request({ host: u.hostname, port: u.port, path: '/api/auth/logout', method: 'POST', headers: { origin, cookie: ownerCookie, ...headers } }, res => { res.resume(); resolve(res.statusCode ?? 0); });
      req.on('error', reject); req.end();
    });
    expect(await send('https://x.example', { host: 'internal', 'x-forwarded-host': 'x.example' })).toBe(200);
    expect(await send('https://evil.example', { host: 'internal', 'x-forwarded-host': 'x.example' })).toBe(403);
  });
});

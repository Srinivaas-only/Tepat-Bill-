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
import { signSession } from './auth';

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
      const dm = await call('GET', `/api/flags/${d2flagId}/message?lang=ms`, ownerCookie);
      expect(dm.status).toBe(200);
      expect(dm.json.text).toContain('bon penghantaran DO-5512');
      expect(dm.json.text).toContain('dalam bon 10, diterima 8');
      expect(dm.json.text.toLowerCase()).not.toContain('invois');
      const r = await call('POST', '/api/invoices', staffCookie, { supplierId: 'sup_ali', poId: 'po_004', deliveryId: del2, invoiceNo: 'INV-2291', currency: 'MYR', totalSen: 99390, lines: iLines('invoice_borong_ali_INV-2291') });
      expect(r.status).toBe(201);
      expect(r.json.compared).toBe(true); expect(r.json.readyToPay).toBe(false);
      expect(r.json.flags.map((f: any) => [f.type, f.sku, f.amountSen]).sort()).toEqual([['price_change', 'gula-pasir-1kg', 2000], ['short_qty', 'maggi-kari', 9000]]);
      const sup = await pool.query(`select superseded_by from ${SCHEMA}.flags where id = $1`, [d2flagId]);
      expect(sup.rows[0].superseded_by).toBeTruthy();
      expect((await call('GET', '/api/suppliers/sup_ali/ledger', ownerCookie)).json.ledger.payNowSen).toBe(96200);
      const maggi = r.json.flags.find((f: any) => f.type === 'short_qty');
      expect((await call('POST', `/api/flags/${maggi.id}/approve`, ownerCookie, { request: 'deduct' })).status).toBe(200);
      const gula = r.json.flags.find((f: any) => f.type === 'price_change');
      // demo script: "Gula: Laporkan harga RM2.80" - the owner states the agreed price, so the message may call it agreed
      expect((await call('POST', `/api/flags/${gula.id}/report-price`, ownerCookie, { agreedSen: 280 })).status).toBe(200);
      const im = await call('GET', `/api/flags/${maggi.id}/message?lang=ms`, ownerCookie);
      const norm = (t: string) => t.replace(/\d{2}\/\d{2}\/\d{4}/, '20/10/2026').replace(/https?:\/\/\S+/, 'https://<host>/e/<token>');
      expect(norm(im.json.text)).toBe(["Salam sejahtera Syarikat Borong Ali Sdn. Bhd., ini Kedai Runcit Maju.", "Merujuk invois INV-2291 bertarikh 20/10/2026 (pesanan PO-2610-004):",
        "• MAGGI KARI 5'S (CTN 8 PEK): dalam invois 10, diterima 8. Kurang 2 unit = RM90.00.",
        "• GULA PASIR 1KG: harga invois RM3.20/unit, harga yang dipersetujui RM2.80/unit, untuk 50 unit = perbezaan RM20.00.", "Jumlah: RM110.00.",
        "Mohon tolak jumlah ini daripada invois.", "Mohon caj mengikut harga yang dipersetujui.", "Bukti (gambar & dokumen): https://<host>/e/<token>", "Terima kasih."].join('\n'));
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
    // changing a checked quantity under a live complaint is an owner-reviewed correction (audit): staff cannot, the owner needs a reason
    const staffTry = await call('PUT', `/api/invoices/${inv.json.id}/counts`, staffCookie, { counts: { 'line:L1': 6 } });
    expect(staffTry.status).toBe(403);
    const noReason = await call('PUT', `/api/invoices/${inv.json.id}/counts`, ownerCookie, { counts: { 'line:L1': 6 } });
    expect(noReason.status).toBe(422);
    const none = await call('PUT', `/api/invoices/${inv.json.id}/counts`, ownerCookie, { counts: { 'line:L1': 6 }, reason: 'Kiraan semula, bekalan sampai kemudian' });
    expect(none.status).toBe(200);
    const kept = (await call('GET', `/api/flags/${f.id}`, ownerCookie)).json.flag;
    expect(kept.status).toBe('open');            // never rewritten silently...
    expect(kept.needsRecheck).toBe(true);        // ...but the owner is told it no longer matches the counts
    expect(kept.missingQty).toBe(2);
    const ev = await call('GET', '/api/activity', ownerCookie);
    expect(JSON.stringify(ev.json)).toContain('count.corrected');
  });

  it('LB-7781: received qty, billed qty and the "6 missing" flag come from ONE record', async () => {
    const r = await call('GET', '/api/invoices/inv_lb7781', ownerCookie);
    expect(r.status).toBe(200);
    const sardin = r.json.lines.find((l: any) => l.lineId === 'L2');
    expect(r.json.counts['line:L2']).toBe(42);                       // seed stores it under the sku; it must not be shadowed by the billed-qty default (48)
    expect(sardin.qty - r.json.counts['line:L2']).toBe(r.json.flags.find((f: any) => f.invoiceLineId === 'L2' && f.type === 'short_qty').missingQty);
    expect(r.json.counts['line:L1']).toBe(50);
  });

  it('delivery evidence (bon + photos) is carried into the invoice complaint and the public evidence page', async () => {
    const up = async (kind: string, photoKind?: string) => {
      const fd = new FormData();
      fd.append('kind', kind); if (photoKind) fd.append('photoKind', photoKind);
      fd.append('file', new Blob([readFileSync('fixtures/docs/do_lim_brothers_DO-LB-0901.png'), Buffer.from(String(Math.random()))], { type: 'image/png' }), 'd.png');
      return await (await fetch(base + '/api/documents', { method: 'POST', headers: { cookie: staffCookie }, body: fd })).json() as any;
    };
    const bon = await up('delivery_note');
    const d = await call('POST', '/api/deliveries', staffCookie, { supplierId: 'sup_lim', poId: 'po_006', doNo: 'DO-EV-1', documentId: bon.id, lines: [...dLines('do_lim_brothers_DO-LB-0901'), { description: 'Biskut Bukti Satu', qty: 2, unit: 'pkt' }] });
    expect(d.status).toBe(201);
    await call('PUT', `/api/deliveries/${d.json.id}/counts`, staffCookie, { counts: {} });
    const inv = await call('POST', '/api/invoices', staffCookie, { supplierId: 'sup_lim', poId: 'po_006', deliveryId: d.json.id, invoiceNo: 'LB-EV-1', currency: 'MYR', totalSen: 28560 + 2 * 300,
      lines: [...iLines('invoice_lim_brothers_LB-7810'), { description: 'Biskut Bukti Satu', qty: 2, unit: 'pkt', unitPriceSen: 300 }] });
    expect(inv.status).toBe(201);
    const flag = inv.json.flags.find((f: any) => f.type === 'not_ordered');
    expect(flag).toBeTruthy();
    const photos = await pool.query(`select document_id from ${SCHEMA}.flag_photos where flag_id = $1`, [flag.id]);
    expect(photos.rows.map((r: any) => r.document_id)).toContain(bon.id);
    // a delivery photo uploaded AFTER linking also reaches the invoice complaint
    const late = await (async () => { const fd = new FormData(); fd.append('kind', 'photo'); fd.append('photoKind', 'delivery'); fd.append('deliveryId', d.json.id);
      fd.append('file', new Blob([readFileSync('fixtures/docs/delivery_photo_INV-2291.png'), Buffer.from('late')], { type: 'image/png' }), 'p.png');
      return await (await fetch(base + '/api/documents', { method: 'POST', headers: { cookie: staffCookie }, body: fd })).json() as any; })();
    const photos2 = await pool.query(`select document_id from ${SCHEMA}.flag_photos where flag_id = $1`, [flag.id]);
    expect(photos2.rows.map((r: any) => r.document_id)).toContain(late.id);
    // the compared invoice is relied on once its flag is approved: recounting the delivery is then an owner-reviewed correction
    expect((await call('POST', `/api/flags/${flag.id}/approve`, ownerCookie, {})).status).toBe(200);
    const recount = { counts: { 'line:L1': 3 } };
    expect((await call('PUT', `/api/deliveries/${d.json.id}/counts`, staffCookie, recount)).status).toBe(403);
    expect((await call('PUT', `/api/deliveries/${d.json.id}/counts`, ownerCookie, recount)).status).toBe(422);
    expect((await call('PUT', `/api/deliveries/${d.json.id}/counts`, ownerCookie, { ...recount, reason: 'Kiraan semula' })).status).toBe(200);
    const after = await call('GET', `/api/invoices/${inv.json.id}`, ownerCookie);
    expect(after.json.counts['line:L1']).toBe(3);                    // invoice follows the delivery: one record
    expect(JSON.stringify((await call('GET', '/api/activity', ownerCookie)).json)).toContain('count.corrected');
  });

  it('a proposed flag gets a read-only draft preview; sending stays blocked until approval', async () => {
    const inv = await call('POST', '/api/invoices', staffCookie, { supplierId: 'sup_ali', invoiceNo: 'PREV-1', lines: [{ description: 'Teh Bunga', qty: 6, unitPriceSen: 500 }], totalSen: 3000 });
    const f = (await call('PUT', `/api/invoices/${inv.json.id}/counts`, staffCookie, { counts: { 'line:L1': 4 } })).json.flags[0];
    expect(f.status).toBe('proposed');
    const pv = await call('GET', `/api/flags/${f.id}/message?lang=ms`, ownerCookie);
    expect(pv.status).toBe(200);
    expect(pv.json.preview).toBe(true);
    expect(pv.json.text).toContain('Kurang 2 unit = RM10.00');
    expect(pv.json.flagIds).toEqual([f.id]);
    expect((await call('GET', `/api/flags/${f.id}/message?lang=ms`, staffCookie)).status).toBe(403);
    // nothing was stamped as sent and the flag is still proposed
    expect((await call('POST', '/api/flags/sent', ownerCookie, { flagIds: [f.id] })).status).toBeGreaterThanOrEqual(400);
    expect((await call('GET', `/api/flags/${f.id}`, ownerCookie)).json.flag.status).toBe('proposed');
  });

  it('supplier acceptance: only the accepted amount and reference are recorded and credited', async () => {
    const inv = await call('POST', '/api/invoices', staffCookie, { supplierId: 'sup_ali', invoiceNo: 'ACC-1', lines: [{ description: 'Kopi Tarik', qty: 6, unitPriceSen: 500 }], totalSen: 3000 });
    const f = (await call('PUT', `/api/invoices/${inv.json.id}/counts`, staffCookie, { counts: { 'line:L1': 4 } })).json.flags[0];
    expect(f.amountSen).toBe(1000);
    expect((await call('POST', `/api/flags/${f.id}/approve`, ownerCookie, { request: 'deduct' })).status).toBe(200);
    expect((await call('POST', `/api/flags/${f.id}/settle`, staffCookie, { settlement: 'credit_note', acceptedSen: 600 })).status).toBe(403);
    expect((await call('POST', `/api/flags/${f.id}/settle`, ownerCookie, { settlement: 'credit_note', acceptedSen: 1001 })).status).toBe(409);
    const ok = await call('POST', `/api/flags/${f.id}/settle`, ownerCookie, { settlement: 'credit_note', acceptedSen: 600, ref: 'CN-1042' });
    expect(ok.status).toBe(200);
    expect(ok.json.flag).toMatchObject({ status: 'settled', amountSen: 1000, acceptedSen: 600, settlementRef: 'CN-1042' });
    const L = (await call('GET', '/api/suppliers/sup_ali/ledger', ownerCookie)).json.ledger;
    expect(L.rows.find((r: any) => r.id === inv.json.id).netOwedSen).toBe(2400);
    expect(JSON.stringify((await call('GET', '/api/activity', ownerCookie)).json)).toContain('flag.settle.credit_note');
  });

  it('linking an invoice never marks a delivery correct: the owner confirms it', async () => {
    const d = await call('POST', '/api/deliveries', staffCookie, { supplierId: 'sup_lim', poId: 'po_006', doNo: 'DO-ST-1', lines: dLines('do_lim_brothers_DO-LB-0901') });
    await call('PUT', `/api/deliveries/${d.json.id}/counts`, staffCookie, { counts: {} });
    const state = async () => (await call('GET', '/api/deliveries', ownerCookie)).json.deliveries.find((x: any) => x.id === d.json.id).state;
    expect(await state()).toBe('confirm');   // counted clean: the owner still has to confirm it
    const inv = await call('POST', '/api/invoices', staffCookie, { supplierId: 'sup_lim', poId: 'po_006', deliveryId: d.json.id, invoiceNo: 'LB-ST-1', currency: 'MYR', totalSen: 28560, lines: iLines('invoice_lim_brothers_LB-7810') });
    expect(inv.status).toBe(201);
    expect(await state()).toBe('confirm');
    expect((await call('POST', `/api/deliveries/${d.json.id}/mark-correct`, staffCookie)).status).toBe(403);
    expect((await call('POST', `/api/deliveries/${d.json.id}/mark-correct`, ownerCookie)).status).toBe(200);
    expect(await state()).toBe('correct');
  });

  it('a delivery is shown against the complete order, including order lines it does not mention', async () => {
    const lines = dLines('do_lim_brothers_DO-LB-0901');
    const d = await call('POST', '/api/deliveries', staffCookie, { supplierId: 'sup_lim', poId: 'po_006', doNo: 'DO-FUL-1', lines: lines.slice(0, 1) });
    expect(d.status).toBe(201);
    const r = await call('GET', `/api/deliveries/${d.json.id}`, ownerCookie);
    expect(r.status).toBe(200);
    const po = await call('GET', '/api/pos/po_006', ownerCookie);
    const f = r.json.fulfilment as any[];
    expect(f.length).toBe(po.json.lines.length);
    expect(f.every(x => x.ordered > 0 && x.outstanding === Math.max(0, x.ordered - x.received))).toBe(true);
    expect(f.every(x => ['complete', 'partial', 'not_delivered', 'over'].includes(x.status))).toBe(true);
    // an order line with nothing received can never read as complete
    expect(f.filter(x => x.received === 0).every(x => x.status === 'not_delivered' && x.outstanding === x.ordered)).toBe(true);
  });

  it('accounting handoff is a labelled simulation: owner only, sends nothing, is logged', async () => {
    expect((await call('POST', '/api/accounting/handoff-simulation', staffCookie, {})).status).toBe(403);
    const r = await call('POST', '/api/accounting/handoff-simulation', ownerCookie, {});
    expect(r.status).toBe(200);
    expect(r.json.simulated).toBe(true);
    expect(JSON.stringify((await call('GET', '/api/activity', ownerCookie)).json)).toContain('accounting.handoff_sim');
  });

  it('delivery recount under a sent complaint needs the owner + reason even with no invoice, and resets the confirmation', async () => {
    const d = await call('POST', '/api/deliveries', staffCookie, { supplierId: 'sup_lim', poId: 'po_006', doNo: 'DO-RC-1', lines: dLines('do_lim_brothers_DO-LB-0901') });
    const c = await call('PUT', `/api/deliveries/${d.json.id}/counts`, staffCookie, { counts: { 'line:L1': 1 } });
    const f = c.json.flags.find((x: any) => x.type === 'short_qty');
    expect(f).toBeTruthy();
    expect((await call('POST', `/api/flags/${f.id}/approve`, ownerCookie, {})).status).toBe(200);
    expect((await call('PUT', `/api/deliveries/${d.json.id}/counts`, staffCookie, { counts: { 'line:L1': 2 } })).status).toBe(403);
    expect((await call('PUT', `/api/deliveries/${d.json.id}/counts`, ownerCookie, { counts: { 'line:L1': 2 } })).status).toBe(422);
    expect((await call('PUT', `/api/deliveries/${d.json.id}/counts`, ownerCookie, { counts: { 'line:L1': 2 }, reason: 'Kiraan semula' })).status).toBe(200);
  });

  it('a historical price reference is never asked for as the "agreed" price', async () => {
    const inv = await call('POST', '/api/invoices', staffCookie, { supplierId: 'sup_ali', invoiceNo: 'AGR-1', lines: [{ description: 'Gula Pasir 1kg', qty: 10, unitPriceSen: 330 }], totalSen: 3300 });
    const f = (await call('PUT', `/api/invoices/${inv.json.id}/counts`, staffCookie, { counts: {}, confirmed: 'all' })).json.flags.find((x: any) => x.type === 'price_change');
    if (!f || f.baselineSource === 'agreed') return;                  // only meaningful when the reference is history
    expect((await call('POST', `/api/flags/${f.id}/approve`, ownerCookie, {})).status).toBe(200);
    const m = await call('GET', `/api/flags/${f.id}/message?lang=en`, ownerCookie);
    expect(m.json.text).not.toContain('agreed price');
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

  it('T1 not_ordered delivery flag is carried to the invoice; a settled one is left alone', async () => {
    const extra = { description: 'Biskut Hijau Istimewa', qty: 5, unit: 'pkt' };
    const d = await call('POST', '/api/deliveries', staffCookie, { supplierId: 'sup_lim', poId: 'po_006', doNo: 'DO-NO-1', lines: [...dLines('do_lim_brothers_DO-LB-0901'), extra] });
    expect(d.status).toBe(201);
    const c = await call('PUT', `/api/deliveries/${d.json.id}/counts`, staffCookie, { counts: {} });
    const dflag = c.json.flags.find((f: any) => f.type === 'not_ordered');
    expect(dflag).toBeTruthy();
    expect((await call('POST', `/api/flags/${dflag.id}/approve`, ownerCookie, {})).status).toBe(200);
    const inv = await call('POST', '/api/invoices', staffCookie, { supplierId: 'sup_lim', poId: 'po_006', deliveryId: d.json.id, invoiceNo: 'LB-NO-1', currency: 'MYR', totalSen: 28560 + 5 * 200,
      lines: [...iLines('invoice_lim_brothers_LB-7810'), { description: 'Biskut Hijau Istimewa', qty: 5, unit: 'pkt', unitPriceSen: 200 }] });
    expect(inv.status).toBe(201);
    const invFlag = inv.json.flags.find((f: any) => f.type === 'not_ordered');
    expect(invFlag).toBeTruthy();
    const row = await pool.query(`select superseded_by, status from ${SCHEMA}.flags where id = $1`, [dflag.id]);
    expect(row.rows[0].superseded_by).toBe(invFlag.id);
    expect(row.rows[0].status).toBe('open');
  });

  it('T1b a settled delivery not_ordered flag is untouched by a later invoice', async () => {
    const d = await call('POST', '/api/deliveries', staffCookie, { supplierId: 'sup_lim', poId: 'po_006', doNo: 'DO-NO-2', lines: [...dLines('do_lim_brothers_DO-LB-0901'), { description: 'Kuih Sagu Pelik', qty: 3, unit: 'pkt' }] });
    const c = await call('PUT', `/api/deliveries/${d.json.id}/counts`, staffCookie, { counts: {} });
    const dflag = c.json.flags.find((f: any) => f.type === 'not_ordered');
    expect(dflag).toBeTruthy();
    await call('POST', `/api/flags/${dflag.id}/approve`, ownerCookie, {});
    expect((await call('POST', `/api/flags/${dflag.id}/settle`, ownerCookie, { settlement: 'credit_note' })).status).toBe(200);
    const inv = await call('POST', '/api/invoices', staffCookie, { supplierId: 'sup_lim', poId: 'po_006', deliveryId: d.json.id, invoiceNo: 'LB-NO-2', currency: 'MYR', totalSen: 28560 + 3 * 100,
      lines: [...iLines('invoice_lim_brothers_LB-7810'), { description: 'Kuih Sagu Pelik', qty: 3, unit: 'pkt', unitPriceSen: 100 }] });
    expect(inv.status).toBe(201);
    const row = await pool.query(`select superseded_by, status from ${SCHEMA}.flags where id = $1`, [dflag.id]);
    expect(row.rows[0].superseded_by).toBeNull();
    expect(row.rows[0].status).toBe('settled');
  });

  it('T2 sessions signed before a PIN change are rejected', async () => {
    const prev = process.env.OWNER_PIN;
    const old = await signSession('owner');
    const cookie = `tb_session=${old}`;
    const me = (c: string) => call('GET', '/api/auth/me', c);
    const name = (await fetch(base + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ pin: owner }) })).headers.get('set-cookie')!.split('=')[0];
    const ck = `${name}=${old}`;
    expect((await me(ck)).status).toBe(200);
    try {
      process.env.OWNER_PIN = owner === '4321' ? '4322' : '4321';
      expect((await me(ck)).status).toBe(401);
      const fresh = `${name}=${await signSession('owner')}`;
      expect((await me(fresh)).status).toBe(200);
    } finally { if (prev === undefined) delete process.env.OWNER_PIN; else process.env.OWNER_PIN = prev; }
    expect(cookie).toContain(old);
  });

  it('T3 gemini-check: no key -> ok:false; staff 403; logged out 401; no cache/checks/event side effects', async () => {
    const prevKey = process.env.GEMINI_API_KEY; delete process.env.GEMINI_API_KEY;
    try {
      const ext0 = (await pool.query(`select count(*)::int as n from ${SCHEMA}.extractions`)).rows[0].n;
      const ev0 = (await pool.query(`select count(*)::int as n from ${SCHEMA}.events`)).rows[0].n;
      const checks0 = (await pool.query(`select value from ${SCHEMA}.settings where key = 'checks_left'`)).rows[0].value;
      expect((await call('POST', '/api/gemini-check')).status).toBe(401);
      expect((await call('POST', '/api/gemini-check', staffCookie)).status).toBe(403);
      const r = await call('POST', '/api/gemini-check', ownerCookie);
      expect(r.status).toBe(200); expect(r.json.ok).toBe(false);
      expect((await pool.query(`select count(*)::int as n from ${SCHEMA}.extractions`)).rows[0].n).toBe(ext0);
      expect((await pool.query(`select count(*)::int as n from ${SCHEMA}.events`)).rows[0].n).toBe(ev0);
      expect((await pool.query(`select value from ${SCHEMA}.settings where key = 'checks_left'`)).rows[0].value).toEqual(checks0);
    } finally { if (prevKey !== undefined) process.env.GEMINI_API_KEY = prevKey; }
  });

  it('T4 decimal box_2d through POST /api/invoices is stored as integers', async () => {
    const r = await call('POST', '/api/invoices', staffCookie, { supplierId: 'sup_ali', invoiceNo: 'BOX-1', totalSen: 1000, lines: [{ description: 'Teh Boh', qty: 1, unitPriceSen: 1000, box: [10.4, 20.6, 100.2, 300.9] }] });
    expect(r.status).toBe(201);
    const row = await pool.query(`select box from ${SCHEMA}.invoice_lines where invoice_id = $1`, [r.json.id]);
    expect(row.rows[0].box).toEqual([10, 21, 100, 301]);
  });

  it('T5 sku minting through POST /api/pos', async () => {
    const r = await call('POST', '/api/pos', staffCookie, { supplierId: 'sup_ali', source: 'typed', lines: [{ description: 'Gula pasir 1kg', qty: 2 }] });
    expect(r.status).toBe(201);
    const r2 = await call('POST', '/api/pos', staffCookie, { supplierId: 'sup_ali', source: 'typed', lines: [{ description: 'Gula perang 1kg', qty: 2 }] });
    const row = await pool.query(`select sku from ${SCHEMA}.po_lines where po_id = $1`, [r2.json.id]);
    expect(row.rows[0].sku).toBe('gula-perang-1kg');
  });

  it('T6 races: one new supplier row; one approve wins; one invoice wins', async () => {
    const body = { newSupplier: { name: 'Pembekal Perlumbaan' }, source: 'typed', lines: [{ description: 'Roti', qty: 1 }] };
    const rs = await Promise.all([call('POST', '/api/pos', staffCookie, body), call('POST', '/api/pos', staffCookie, body)]);
    expect(rs.map(r => r.status)).toEqual([201, 201]);
    expect((await pool.query(`select count(*)::int as n from ${SCHEMA}.suppliers where lower(name) = 'pembekal perlumbaan'`)).rows[0].n).toBe(1);
    const inv = await call('POST', '/api/invoices', staffCookie, { supplierId: 'sup_ali', invoiceNo: 'RACE-T6', lines: [{ description: 'Mee', qty: 4, unitPriceSen: 500 }], totalSen: 2000 });
    const put = await call('PUT', `/api/invoices/${inv.json.id}/counts`, staffCookie, { counts: { 'line:L1': 2 } });
    const id = put.json.flags[0].id;
    const ap = await Promise.all([call('POST', `/api/flags/${id}/approve`, ownerCookie, {}), call('POST', `/api/flags/${id}/approve`, ownerCookie, {})]);
    expect(ap.map(r => r.status).sort()).toEqual([200, 409]);
    expect((await pool.query(`select count(*)::int as n from ${SCHEMA}.events where ref = $1 and action = 'flag.approve'`, [id])).rows[0].n).toBe(1);
    const ib = { supplierId: 'sup_ali', invoiceNo: 'RACE-T6B', lines: [{ description: 'Mee', qty: 4, unitPriceSen: 500 }], totalSen: 2000 };
    const ps = await Promise.all([call('POST', '/api/invoices', staffCookie, ib), call('POST', '/api/invoices', staffCookie, ib)]);
    expect(ps.map(r => r.status).sort()).toEqual([201, 409]);
  });

  it('T7 home summary is unchanged by 600 extra dismissed flags (the list cap never touches money)', async () => {
    const before = (await call('GET', '/api/home', ownerCookie)).json.summary;
    await pool.query(`insert into ${SCHEMA}.flags (id, supplier_id, invoice_id, invoice_line_id, type, amount_sen, status, evidence_token, stage)
      select 'flg_bulk_' || g, 'sup_ali', 'inv_bulk_' || g, 'L1', 'short_qty', 0, 'dismissed', md5('bulk' || g) || md5('x' || g), 'invoice' from generate_series(1, 600) g`).catch(e => { throw e; });
    const after = (await call('GET', '/api/home', ownerCookie)).json.summary;
    expect(after).toEqual(before);
    expect((await call('GET', '/api/flags', ownerCookie)).json.flags.length).toBeLessThanOrEqual(500);
  });

  // ---- round 6
  const newSup = (name: string) => ({ newSupplier: { name } });
  const mkPo = async (sup: any, unit?: number) => (await call('POST', '/api/pos', staffCookie, { ...sup, source: 'typed', lines: [{ description: 'Teh Kotak', qty: 10, ...(unit ? { unitPriceSen: unit } : {}) }] })).json;
  const inv = async (supplierId: string, no: string, price: number, poId?: string) => {
    const c = await call('POST', '/api/invoices', staffCookie, { supplierId, poId, invoiceNo: no, totalSen: price * 10, lines: [{ description: 'Teh Kotak', qty: 10, unitPriceSen: price }] });
    return call('PUT', `/api/invoices/${c.json.id}/counts`, staffCookie, { counts: {} });
  };
  const priceFlags = (r: any) => r.json.flags.filter((f: any) => f.type === 'price_change');

  it('R6-T1 a price decrease flag, once dismissed, does not come back', async () => {
    const po = await mkPo(newSup('Pembekal Turun'));
    const sid = (await pool.query(`select supplier_id from ${SCHEMA}.purchase_orders where id = $1`, [po.id])).rows[0].supplier_id;
    expect(priceFlags(await inv(sid, 'D-1', 280, po.id))).toHaveLength(0);
    const r2 = await inv(sid, 'D-2', 250, po.id);
    const down = priceFlags(r2);
    expect(down).toHaveLength(1); expect(down[0].direction).toBe('down');
    expect((await call('POST', `/api/flags/${down[0].id}/dismiss`, ownerCookie, {})).status).toBe(200);
    expect(priceFlags(await inv(sid, 'D-3', 250, po.id))).toHaveLength(0);
  });

  it('R6-T2 "ordinary increase" sticks with an agreed price or a PO price', async () => {
    const po = await mkPo(newSup('Pembekal Naik'));
    const sid = (await pool.query(`select supplier_id from ${SCHEMA}.purchase_orders where id = $1`, [po.id])).rows[0].supplier_id;
    await inv(sid, 'U-1', 280, po.id);
    await pool.query(`update ${SCHEMA}.price_list set agreed_sen = 280 where supplier_id = $1`, [sid]);
    const up = priceFlags(await inv(sid, 'U-2', 320, po.id));
    expect(up).toHaveLength(1); expect(up[0].direction).toBe('up');
    expect((await call('POST', `/api/flags/${up[0].id}/dismiss`, ownerCookie, { asInflation: true })).status).toBe(200);
    expect(priceFlags(await inv(sid, 'U-3', 320, po.id))).toHaveLength(0);
    // PO price, no agreed price
    const po2 = await mkPo(newSup('Pembekal PO Harga'), 280);
    const sid2 = (await pool.query(`select supplier_id from ${SCHEMA}.purchase_orders where id = $1`, [po2.id])).rows[0].supplier_id;
    const up2 = priceFlags(await inv(sid2, 'P-1', 320, po2.id));
    expect(up2).toHaveLength(1);
    expect((await call('POST', `/api/flags/${up2[0].id}/dismiss`, ownerCookie, { asInflation: true })).status).toBe(200);
    expect(priceFlags(await inv(sid2, 'P-2', 320, po2.id))).toHaveLength(0);
  });

  it('R6-T4 a different pack size is not_ordered and is never merged into the same sku', async () => {
    const po = await call('POST', '/api/pos', staffCookie, { ...newSup('Pembekal Minyak'), source: 'typed', lines: [{ description: 'Minyak Masak 1kg', qty: 5, unitPriceSen: 500 }] });
    const sid = (await pool.query(`select supplier_id from ${SCHEMA}.purchase_orders where id = $1`, [po.json.id])).rows[0].supplier_id;
    const r = await call('POST', '/api/invoices', staffCookie, { supplierId: sid, poId: po.json.id, invoiceNo: 'M-1', totalSen: 5 * 2000, lines: [{ description: 'Minyak Masak 5kg', qty: 5, unitPriceSen: 2000 }] });
    expect(r.status).toBe(201);
    const fl = (await call('PUT', `/api/invoices/${r.json.id}/counts`, staffCookie, { counts: {} })).json.flags;
    expect(fl.some((f: any) => f.type === 'not_ordered')).toBe(true);
    expect(fl.some((f: any) => f.type === 'price_change')).toBe(false);
    expect(mintSkus(['Minyak Masak 5kg'], ['minyak-masak-1kg'])).not.toEqual(['minyak-masak-1kg']);
  });

  it('R6-T5 amounts that overflow int4 are rejected with 422, not 500', async () => {
    const r = await call('POST', '/api/invoices', staffCookie, { supplierId: 'sup_ali', invoiceNo: 'BIG-1', lines: [{ description: 'Emas', qty: 100000, unitPriceSen: 100000000 }] });
    expect(r.status).toBe(422); expect(r.json.error?.code ?? r.json.code).toBe('too_large');
    const p = await call('POST', '/api/pos', staffCookie, { supplierId: 'sup_ali', source: 'typed', lines: [{ description: 'Emas', qty: 100000, unitPriceSen: 100000000 }] });
    expect(p.status).toBe(422);
  });
});

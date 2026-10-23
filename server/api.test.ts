import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { sql } from 'drizzle-orm';
import { ALL_TABLES } from '../shared/schema';
import { makeDb } from './db';
import { memoryStorage } from './storage';
import { createApp, mountErrorHandlers } from './app';
import { seedDatabase } from './seed';
import { parseRM } from '../shared/core';

const owner = process.env.OWNER_PIN ?? '1234';
const staff = process.env.STAFF_PIN ?? '5678';

describe.skipIf(!process.env.DATABASE_URL)('api (test schema)', () => {
  let server: Server; let base = ''; let pool: ReturnType<typeof makeDb>['pool'];
  let ownerCookie = ''; let staffCookie = '';

  const call = async (method: string, url: string, cookie?: string, body?: unknown) => {
    const r = await fetch(base + url, { method, headers: { ...(cookie ? { cookie } : {}), ...(body ? { 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
    return { status: r.status, json: (await r.json().catch(() => null)) as any, headers: r.headers };
  };
  const login = async (pin: string) => {
    const r = await fetch(base + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ pin }) });
    return (r.headers.get('set-cookie') ?? '').split(';')[0];
  };

  beforeAll(async () => {
    const admin = makeDb();
    await admin.pool.query('DROP SCHEMA IF EXISTS test CASCADE'); await admin.pool.query('CREATE SCHEMA test');
    for (const t of ALL_TABLES) await admin.pool.query(`CREATE TABLE test."${t}" (LIKE public."${t}" INCLUDING ALL)`);
    await admin.pool.end();
    const m = makeDb(undefined, 'test'); pool = m.pool;
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

  it('guards: 401 without a session, 403 staff on owner action', async () => {
    expect((await call('GET', '/api/suppliers')).status).toBe(401);
    expect((await call('PATCH', '/api/suppliers/sup_ali', staffCookie, { isForeign: true })).status).toBe(403);
    expect((await call('GET', '/api/suppliers', staffCookie)).status).toBe(200);
  });

  it('PO numbering continues the month sequence and mints skus', async () => {
    const seq0 = Number((await pool.query("select (value #>> '{}')::int as v from test.settings where key = 'po_seq:' || to_char(now(), 'YYMM')")).rows[0]?.v ?? 0);
    const a = await call('POST', '/api/pos', staffCookie, { supplierId: 'sup_ali', source: 'typed', lines: [{ description: 'Gula pasir 1kg', qty: 5 }, { description: 'Teh Boh', qty: 2, unitPriceSen: 1250 }] });
    expect(a.status).toBe(201);
    expect(a.json.poNo).toMatch(new RegExp(`^PO-\\d{4}-${String(seq0 + 1).padStart(3, '0')}$`));
    const b = await call('POST', '/api/pos', staffCookie, { newSupplier: { name: 'Kedai Baru Sdn Bhd' }, source: 'typed', lines: [{ description: 'Roti', qty: 1 }, { description: 'Roti', qty: 1 }] });
    expect(b.json.poNo).toMatch(new RegExp(`-${String(seq0 + 2).padStart(3, '0')}$`));
    const detail = await call('GET', `/api/pos/${a.json.id}`, staffCookie);
    expect(detail.json.lines.map((l: any) => l.sku)).toEqual(['gula-pasir-1kg', 'teh-boh']);
    const d2 = await call('GET', `/api/pos/${b.json.id}`, staffCookie);
    expect(d2.json.lines.map((l: any) => l.sku)).toEqual(['roti', 'roti-2']);
  });

  it('staff cannot mark a new supplier foreign; owner can', async () => {
    const s = await call('POST', '/api/pos', staffCookie, { newSupplier: { name: 'Sino Trading', isForeign: true, country: 'CN' }, source: 'typed', lines: [{ description: 'x', qty: 1 }] });
    expect(s.status).toBe(201);
    const o = await call('POST', '/api/pos', ownerCookie, { newSupplier: { name: 'Sino Two', isForeign: true, country: 'CN' }, source: 'typed', lines: [{ description: 'x', qty: 1 }] });
    const sup = (await call('GET', '/api/suppliers', ownerCookie)).json.suppliers;
    expect(sup.find((x: any) => x.name === 'Sino Trading').isForeign).toBe(false);
    expect(sup.find((x: any) => x.name === 'Sino Two').isForeign).toBe(true);
    expect(o.status).toBe(201);
  });

  it('duplicate invoice returns 409 with the existing id', async () => {
    const r = await call('POST', '/api/invoices', staffCookie, { supplierId: 'sup_ali', invoiceNo: 'inv-2207', lines: [{ description: 'x', qty: 1, unitPriceSen: 100 }] });
    expect(r.status).toBe(409);
    expect(r.json.error.code).toBe('duplicate_invoice');
    expect(r.json.error.invoiceId).toBe('inv_2207');
  });

  it('INV-2291: counts {line:L1: 8} give exactly the Maggi short (RM90) and Gula price (RM20) flags', async () => {
    const e = JSON.parse(readFileSync('fixtures/docs/invoice_borong_ali_INV-2291.expected.json', 'utf8'));
    const lines = e.lines.map((l: any) => ({ description: l.description, qty: l.qty, unitPriceSen: parseRM(l.unitPrice) }));
    const inv = await call('POST', '/api/invoices', staffCookie, { supplierId: 'sup_ali', poId: 'po_004', invoiceNo: 'INV-2291', currency: 'MYR', lines, totalSen: 99390 });
    expect(inv.status).toBe(201);
    const put = await call('PUT', `/api/invoices/${inv.json.id}/counts`, staffCookie, { counts: { 'line:L1': 8 } });
    expect(put.status).toBe(200);
    const fl = put.json.flags.map((f: any) => [f.type, f.sku, f.amountSen]).sort();
    expect(fl).toEqual([['price_change', 'gula-pasir-1kg', 2000], ['short_qty', 'maggi-kari', 9000]]);
    // saving again is stable (proposed flags are replaced, not duplicated)
    const again = await call('PUT', `/api/invoices/${inv.json.id}/counts`, staffCookie, { counts: { 'line:L1': 8 } });
    expect(again.json.flags).toHaveLength(2);
    const detail = await call('GET', `/api/invoices/${inv.json.id}`, staffCookie);
    expect(detail.json.hasCounts).toBe(true);
    expect(detail.json.counts['line:L1']).toBe(8);
    // gula baseline did not get overwritten by the disputed new price
    const pl = await pool.query("select last_invoice_sen from test.price_list where supplier_id='sup_ali' and sku='gula-pasir-1kg'");
    expect(pl.rows[0].last_invoice_sen).toBe(280);
    // the money shot: Pay now drops RM962.00 -> RM872.00 once the Maggi short is approved (deduct) and settled `deducted`
    const ledger0 = await call('GET', '/api/suppliers/sup_ali/ledger', ownerCookie);
    expect(ledger0.json.ledger.payNowSen).toBe(96200);
    const maggi = put.json.flags.find((f: any) => f.type === 'short_qty');
    expect((await call('POST', `/api/flags/${maggi.id}/approve`, ownerCookie, { request: 'deduct' })).status).toBe(200);
    expect((await call('POST', `/api/flags/${maggi.id}/settle`, ownerCookie, { settlement: 'deducted' })).status).toBe(200);
    expect((await call('GET', '/api/suppliers/sup_ali/ledger', ownerCookie)).json.ledger.payNowSen).toBe(87200);
  });

  it('foreign invoice: line totals come from the foreign amount (no per-unit rounding drift) and flags keep integer unit sen', async () => {
    // USD 0.33 x 1000 at 4.20: the exact line is RM1,386.00; rounding the unit to RM1.39 first would give RM1,390.00
    const r = await call('POST', '/api/invoices', ownerCookie, { newSupplier: { name: 'Rounding Test Foods Ltd', isForeign: true, country: 'CN' }, invoiceNo: 'FX-ROUND-1', currency: 'USD', exchangeRateBp: 42000, totalForeignMinor: 33000,
      lines: [{ description: 'Biskut kelapa', qty: 1000, unitPriceForeignMinor: 33 }] });
    expect(r.status).toBe(201);
    const d = await call('GET', `/api/invoices/${r.json.id}`, ownerCookie);
    expect(d.json.lines[0].unitPriceSen).toBe(139);
    expect(d.json.lines[0].lineTotalSen).toBe(138600);
    expect(d.json.invoice?.totalSen ?? d.json.totalSen).toBe(138600);
  });

  it('a price rise on a line with nothing received never becomes the new baseline', async () => {
    const po = await call('POST', '/api/pos', ownerCookie, { newSupplier: { name: 'Zeta Noodles Sdn Bhd' }, source: 'typed', lines: [{ description: 'Mee Segera', qty: 10 }] });
    expect(po.status).toBe(201);
    const supId = (await call('GET', '/api/suppliers', ownerCookie)).json.suppliers.find((x: any) => x.name === 'Zeta Noodles Sdn Bhd').id;
    const inv1 = await call('POST', '/api/invoices', ownerCookie, { supplierId: supId, poId: po.json.id, invoiceNo: 'ZN-1', lines: [{ description: 'Mee Segera', qty: 10, unitPriceSen: 500 }], totalSen: 5000 });
    await call('PUT', `/api/invoices/${inv1.json.id}/counts`, ownerCookie, { counts: {} });
    const lastInv = async () => (await pool.query(`select last_invoice_sen as n from test.price_list where supplier_id = $1 and sku = 'mee-segera'`, [supId])).rows[0]?.n;
    expect(await lastInv()).toBe(500);
    const inv2 = await call('POST', '/api/invoices', ownerCookie, { supplierId: supId, poId: po.json.id, invoiceNo: 'ZN-2', lines: [{ description: 'Mee Segera', qty: 10, unitPriceSen: 800 }], totalSen: 8000 });
    const put = await call('PUT', `/api/invoices/${inv2.json.id}/counts`, ownerCookie, { counts: { 'line:L1': 0 } });
    expect(put.json.flags.map((f: any) => f.type)).toEqual(['short_qty']);      // nothing received: only the shortage is claimed
    expect(await lastInv()).toBe(500);                                           // ...and RM8.00 is NOT adopted as the normal price
  });

  it('no PO: a different product (Gula perang) does not map to gula-pasir-1kg', async () => {
    const inv = await call('POST', '/api/invoices', staffCookie, { supplierId: 'sup_ali', invoiceNo: 'NOPO-GULA', lines: [{ description: 'Gula perang 1kg', qty: 3, unitPriceSen: 400 }], totalSen: 1200 });
    const put = await call('PUT', `/api/invoices/${inv.json.id}/counts`, staffCookie, { counts: {} });
    expect(put.json.flags.filter((f: any) => f.sku === 'gula-pasir-1kg')).toHaveLength(0);
  });

  it('no PO: implicit PO means no not_ordered flags', async () => {
    const inv = await call('POST', '/api/invoices', staffCookie, { supplierId: 'sup_sinar', invoiceNo: 'NOPO-1', lines: [{ description: 'Roti Gardenia', qty: 4, unitPriceSen: 300 }], totalSen: 1200 });
    const put = await call('PUT', `/api/invoices/${inv.json.id}/counts`, staffCookie, { counts: {} });
    expect(put.json.flags.filter((f: any) => f.type === 'not_ordered')).toHaveLength(0);
  });

  describe('flag actions', () => {
    let invId = ''; let flags: any[] = [];
    beforeAll(async () => {
      const inv = await call('POST', '/api/invoices', staffCookie, { supplierId: 'sup_ali', poId: 'po_004', invoiceNo: 'INV-ACT-1', lines: [
        { description: "MAGGI KARI 5'S (CTN 8 PEK)", qty: 10, unitPriceSen: 4500 }, { description: 'GULA PASIR 1KG', qty: 50, unitPriceSen: 320 },
        { description: 'BERAS CAP RAMBUTAN 10KG', qty: 5, unitPriceSen: 3850 }, { description: 'MINYAK MASAK BURUH 5KG', qty: 6, unitPriceSen: 3190 }], totalSen: 99390 });
      invId = inv.json.id;
      flags = (await call('PUT', `/api/invoices/${invId}/counts`, staffCookie, { counts: { 'line:L1': 8 } })).json.flags;
    });
    it('staff 403 on every owner action', async () => {
      for (const a of ['approve', 'dismiss', 'report-price', 'link-substitute']) expect((await call('POST', `/api/flags/${flags[0].id}/${a}`, staffCookie, {})).status).toBe(403);
    });
    it('approve defaults the request and cannot repeat', async () => {
      const short = flags.find(f => f.type === 'short_qty');
      const a = await call('POST', `/api/flags/${short.id}/approve`, ownerCookie, {});
      expect(a.status).toBe(200); expect(a.json.flag.status).toBe('open'); expect(a.json.flag.request).toBe('deduct');
      expect((await call('POST', `/api/flags/${short.id}/approve`, ownerCookie, {})).status).toBe(409);
    });
    it('report-price re-runs detection against the agreed price', async () => {
      const price = flags.find(f => f.type === 'price_change');
      const r = await call('POST', `/api/flags/${price.id}/report-price`, ownerCookie, { agreedSen: 300 });
      expect(r.json.flag).toMatchObject({ status: 'open', request: 'agreed_price', amountSen: 1000, baselineUnitSen: 300, baselineSource: 'agreed' });
    });
    it('message drafts over the invoice\'s open flags, sent marks them together', async () => {
      const short = flags.find(f => f.type === 'short_qty');
      expect((await call('GET', `/api/flags/${short.id}/message`, staffCookie)).status).toBe(403);
      const m = await call('GET', `/api/flags/${short.id}/message?lang=en`, ownerCookie);
      expect(m.status).toBe(200);
      expect(m.json.flagIds).toHaveLength(2);
      expect(m.json.text).toContain('Short 2 units = RM90.00');
      expect(m.json.text).toContain('difference RM10.00');
      expect(m.json.text).toMatch(/\/e\/[0-9a-f]{32}/);
      expect(m.json.link.startsWith('https://wa.me/?text=')).toBe(true);
      const s = await call('POST', '/api/flags/sent', ownerCookie, { flagIds: m.json.flagIds });
      expect(s.status).toBe(200);
      const d = await call('GET', `/api/flags/${short.id}`, ownerCookie);
      expect(d.json.flag.sentAt).toBe(s.json.sentAt);
      const again = await call('GET', `/api/flags/${short.id}/message?reminder=1`, ownerCookie);
      expect(again.json.flagIds).toHaveLength(2);
    });
    it('public evidence: no session, whitelist payload, proposed/unknown tokens 404, noindex, photos only if linked', async () => {
      const short = flags.find(f => f.type === 'short_qty');
      const tok = (await call('GET', `/api/flags/${short.id}`, ownerCookie)).json.evidenceToken as string;
      expect((await call('GET', `/api/flags/${short.id}`, staffCookie)).json.evidenceToken).toBeUndefined();
      const ev = await call('GET', `/api/public/evidence/${tok}`);
      expect(ev.status).toBe(200);
      expect(ev.headers.get('x-robots-tag')).toContain('noindex');
      expect(Object.keys(ev.json).sort()).toEqual(['baseline', 'flag', 'highlight', 'invoice', 'invoiceDoc', 'invoiceDocDate', 'photos', 'po', 'shopName', 'siblings', 'stage', 'supplierName']);
      expect(ev.json.flag.amountSen).toBe(9000);
      expect(ev.json.siblings.every((s: any) => Object.keys(s).sort().join() === 'amountSen,description,status,type')).toBe(true);
      expect(JSON.stringify(ev.json)).not.toMatch(/evidenceToken|owed|supplierId/);
      expect((await call('GET', '/api/public/evidence/deadbeef')).status).toBe(404);
      const prop = (await call('GET', `/api/invoices/${invId}`, ownerCookie)).json.flags;
      expect(prop.length).toBeGreaterThan(0);
      expect(ev.json.photos.length).toBeGreaterThan(0);
      expect((await fetch(base + ev.json.photos[0].url)).status).toBe(200);
      expect((await fetch(base + `/api/public/evidence/${tok}/photo/doc_nope`)).status).toBe(404);
    });
    it('dispute/reopen/settle move the ledger; payment and mark-correct are guarded', async () => {
      const short = flags.find(f => f.type === 'short_qty');
      const id = short.id;
      expect((await call('POST', `/api/flags/${id}/dispute`, staffCookie)).status).toBe(403);
      expect((await call('PATCH', `/api/invoices/${invId}/payment`, staffCookie, { payment: 'paid' })).status).toBe(403);
      const before = (await call('GET', '/api/suppliers/sup_ali/ledger', ownerCookie)).json.ledger;
      expect((await call('POST', `/api/flags/${id}/dispute`, ownerCookie)).json.flag.status).toBe('disputed');
      const mid = (await call('GET', '/api/suppliers/sup_ali/ledger', ownerCookie)).json.ledger;
      expect(mid.owedSen).toBe(before.owedSen);
      expect(mid.disputedSen).toBe(before.disputedSen + 9000);
      expect((await call('POST', `/api/flags/${id}/reopen`, ownerCookie)).json.flag.status).toBe('open');
      expect((await call('POST', `/api/flags/${id}/settle`, ownerCookie, { settlement: 'bogus' })).status).toBe(400);
      expect((await call('POST', `/api/flags/${id}/settle`, ownerCookie, { settlement: 'deducted' })).json.flag.status).toBe('settled');
      expect((await call('POST', `/api/flags/${id}/dispute`, ownerCookie)).status).toBe(409);
      const after = (await call('GET', '/api/suppliers/sup_ali/ledger', ownerCookie)).json.ledger;
      expect(after.owedSen).toBe(before.owedSen - 9000);
      expect((await call('POST', `/api/invoices/${invId}/mark-correct`, ownerCookie)).status).toBe(409);
      const pay = await call('PATCH', `/api/invoices/${invId}/payment`, ownerCookie, { payment: 'paid' });
      expect(pay.status).toBe(200);
      const all = await call('GET', '/api/suppliers/ledgers', staffCookie);
      expect(all.status).toBe(200);
      expect(all.json.suppliers.find((s: any) => s.id === 'sup_ali').owedSen).toBeLessThan(after.owedSen);
    });
    it('home summary and activity feed', async () => {
      expect((await call('GET', '/api/home')).status).toBe(401);
      const h = await call('GET', '/api/home', staffCookie);
      expect(h.status).toBe(200);
      expect(h.json.summary.flaggedSen).toBeGreaterThan(0);
      expect(h.json.needsActionCount).toBeGreaterThanOrEqual(h.json.needsAction.length);
      const a = await call('GET', '/api/activity', staffCookie);
      expect(a.json.events.length).toBeGreaterThan(0);
      expect(a.json.events[0].action).toBeTruthy();
    });
    it('foreign e-invoice preview: prepare, approve, release (log only); csv export; reset guarded', async () => {
      const list = (await call('GET', '/api/invoices', ownerCookie)).json.invoices as any[];
      const gz = list.find(i => i.supplierId === 'sup_gz');
      expect(gz).toBeTruthy();
      expect((await call('POST', `/api/invoices/${gz.id}/einvoice`, staffCookie)).status).toBe(403);
      expect((await call('POST', `/api/invoices/${invId}/einvoice`, ownerCookie)).status).toBe(422);
      const p = await call('POST', `/api/invoices/${gz.id}/einvoice`, ownerCookie);
      expect(p.status).toBe(201);
      expect(p.json.draft.fields.eInvoiceType).toBe('11');
      expect(p.json.draft.fields.supplierTin).toBe('EI00000000030');
      expect(p.json.draft.fields.totalSen).toBe(61000);
      expect((await call('POST', `/api/invoices/${gz.id}/einvoice/release`, ownerCookie)).status).toBe(409);
      expect((await call('POST', `/api/invoices/${gz.id}/einvoice/approve`, ownerCookie)).json.draft.status).toBe('approved');
      expect((await call('POST', `/api/invoices/${gz.id}/einvoice/release`, ownerCookie)).json.draft.status).toBe('released_stub');
      const again = await call('GET', `/api/invoices/${gz.id}/einvoice`, ownerCookie);
      expect(again.json.draft.status).toBe('released_stub');
      const csv = await fetch(base + '/api/export.csv', { headers: { cookie: ownerCookie } });
      expect(csv.status).toBe(200);
      const body = await csv.text();
      expect(body).toContain('Invoice no');
      expect(body).toContain('INV-ACT-1');
      expect((await fetch(base + '/api/export.csv', { headers: { cookie: staffCookie } })).status).toBe(403);
      expect((await call('POST', '/api/dev/reset', staffCookie)).status).toBe(403);
      expect((await call('GET', '/api/checks', staffCookie)).json.checksLeft).toBeTypeOf('number');
    });
    it('documents cannot be re-linked across invoices (evidence leak guard)', async () => {
      const gz = (await call('GET', '/api/invoices/inv_gz088', ownerCookie)).json.invoice;
      expect(gz.documentId).toBeTruthy();
      const att = await call('POST', `/api/documents/${gz.documentId}/attach`, staffCookie, { invoiceId: invId });
      expect(att.status).toBe(409);
      const reuse = await call('POST', '/api/invoices', staffCookie, { supplierId: 'sup_ali', documentId: gz.documentId, invoiceNo: 'LEAK-1', lines: [{ description: 'x', qty: 1, unitPriceSen: 100 }] });
      expect(reuse.status).toBe(422);
      const pos = (await call('GET', '/api/pos', ownerCookie)).json.pos as { id: string; supplierId: string }[];
      const other = pos.find(x => x.supplierId !== 'sup_ali');
      expect(other).toBeTruthy();
      {
        const mix = await call('POST', '/api/invoices', staffCookie, { supplierId: 'sup_ali', poId: other!.id, invoiceNo: 'MIX-1', lines: [{ description: 'x', qty: 1, unitPriceSen: 100 }] });
        expect(mix.status).toBe(422);
      }
      const po = await call('POST', '/api/pos', staffCookie, { supplierId: 'sup_ali', source: 'typed', documentId: gz.documentId, lines: [{ description: 'x', qty: 1 }] });
      expect(po.status).toBe(422);
    });
    it('report-price at the invoice price dismisses the flag', async () => {
      const inv = await call('POST', '/api/invoices', staffCookie, { supplierId: 'sup_ali', poId: 'po_004', invoiceNo: 'INV-ACT-2', lines: [{ description: 'GULA PASIR 1KG', qty: 10, unitPriceSen: 330 }], totalSen: 3300 });
      const put = await call('PUT', `/api/invoices/${inv.json.id}/counts`, staffCookie, {});
      const f = put.json.flags.find((x: any) => x.type === 'price_change');
      const r = await call('POST', `/api/flags/${f.id}/report-price`, ownerCookie, { agreedSen: 330 });
      expect(r.json.flag.status).toBe('dismissed');
    });
    it('link-substitute matches the line to the PO sku and clears the not_ordered flag', async () => {
      const po = await call('POST', '/api/pos', staffCookie, { supplierId: 'sup_sinar', source: 'typed', lines: [{ description: 'Kicap Cap Kipas', qty: 10 }] });
      expect(po.status).toBe(201);
      const inv = await call('POST', '/api/invoices', staffCookie, { supplierId: 'sup_sinar', poId: po.json.id, invoiceNo: 'SUB-1', lines: [{ description: 'Sos Tiram Mamee', qty: 10, unitPriceSen: 500 }], totalSen: 5000 });
      const put = await call('PUT', `/api/invoices/${inv.json.id}/counts`, staffCookie, {});
      const no = put.json.flags.find((x: any) => x.type === 'not_ordered');
      expect(no.amountSen).toBe(5000);
      const detail = await call('GET', `/api/flags/${no.id}`, ownerCookie);
      expect(detail.json.substituteFor.sku).toBe('kicap-cap-kipas');
      const r = await call('POST', `/api/flags/${no.id}/link-substitute`, ownerCookie, { sku: 'kicap-cap-kipas' });
      expect(r.status).toBe(200);
      expect(r.json.flags.filter((x: any) => x.type === 'not_ordered')).toHaveLength(0);
    });
  });
});

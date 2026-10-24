// Fresh demo profile: shop setup only. Everything else is created on the spot from the sample documents.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { ALL_TABLES } from '../../src/shared/schema';
import { makeDb } from '../../src/server/db';
import { memoryStorage } from '../../src/server/storage';
import { createApp, mountErrorHandlers } from '../../src/server/app';
import { seedDatabase } from '../../src/server/seed';
import { parseRM } from '../../src/shared/core';

const SCHEMA = 'test_fresh';
const fx = (n: string) => JSON.parse(readFileSync(`fixtures/docs/${n}.expected.json`, 'utf8'));

describe.skipIf(!process.env.DATABASE_URL)('fresh demo profile (own schema)', () => {
  let server: Server; let base = ''; let pool: ReturnType<typeof makeDb>['pool']; let cookie = '';
  const call = async (method: string, url: string, body?: unknown) => {
    const r = await fetch(base + url, { method, headers: { cookie, ...(body ? { 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
    return { status: r.status, json: (await r.json().catch(() => null)) as any };
  };
  beforeAll(async () => {
    const admin = makeDb();
    await admin.pool.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`); await admin.pool.query(`CREATE SCHEMA ${SCHEMA}`);
    for (const t of ALL_TABLES) await admin.pool.query(`CREATE TABLE ${SCHEMA}."${t}" (LIKE public."${t}" INCLUDING ALL)`);
    await admin.pool.end();
    const m = makeDb(undefined, SCHEMA); pool = m.pool;
    const storage = memoryStorage();
    await seedDatabase(m.db, storage, Date.now(), { quiet: true, profile: 'fresh' });
    const app = createApp({ db: m.db, storage, gemini: () => { throw new Error('gemini must not be called'); } });
    mountErrorHandlers(app);
    await new Promise<void>(res => { server = app.listen(0, () => res()); });
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const r = await fetch(base + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ pin: process.env.OWNER_PIN ?? '1234' }) });
    cookie = (r.headers.get('set-cookie') ?? '').split(';')[0];
  });
  afterAll(async () => { server?.close(); await pool?.end(); });

  const count = async (t: string) => Number((await pool.query(`select count(*)::int n from ${SCHEMA}."${t}"`)).rows[0].n);

  it('starts with shop setup only: nothing pre-made', async () => {
    for (const t of ['purchase_orders', 'invoices', 'flags', 'documents', 'received_counts']) expect(await count(t)).toBe(0);
    expect(await count('suppliers')).toBe(4);
    expect(await count('price_list')).toBeGreaterThan(0);
    expect(await count('extractions')).toBeGreaterThan(0);
    const h = await call('GET', '/api/home');
    expect(h.status).toBe(200);
    expect(h.json.summary).toMatchObject({ flaggedSen: 0, settledSen: 0, openSen: 0 });
  });

  it('the whole story works on the spot: PO sample -> bon -> counts -> invoice -> RM90 short + RM20 price flag', async () => {
    const po = fx('po_notebook_borong_ali');
    const p = await call('POST', '/api/pos', { supplierId: 'sup_ali', source: 'notebook', lines: po.lines.map((l: any) => ({ description: l.description, qty: l.qty, unit: l.unit })) });
    expect(p.status).toBe(201);
    const bon = fx('bon_signed_DO-5512');
    const d = await call('POST', '/api/deliveries', { supplierId: 'sup_ali', poId: p.json.id, doNo: 'DO-5512', docDate: '2026-10-20', lines: bon.lines.map((l: any) => ({ description: l.description, qty: l.qty, unit: l.unit })) });
    expect(d.status).toBe(201);
    const c = await call('PUT', `/api/deliveries/${d.json.id}/counts`, { counts: { 'line:L1': 8 } });
    expect(c.json.flags[0]).toMatchObject({ type: 'short_qty', sku: 'maggi-kari', amountSen: 9000 });
    const inv = fx('invoice_borong_ali_INV-2291');
    const i = await call('POST', '/api/invoices', { supplierId: 'sup_ali', poId: p.json.id, deliveryId: d.json.id, invoiceNo: 'INV-2291', currency: 'MYR', totalSen: 99390,
      lines: inv.lines.map((l: any) => ({ description: l.description, qty: l.qty, unit: l.unit, unitPriceSen: parseRM(l.unitPrice) })) });
    expect(i.status).toBe(201);
    expect(i.json.flags.map((f: any) => [f.type, f.sku, f.amountSen]).sort()).toEqual([['price_change', 'gula-pasir-1kg', 2000], ['short_qty', 'maggi-kari', 9000]]);
  });
});

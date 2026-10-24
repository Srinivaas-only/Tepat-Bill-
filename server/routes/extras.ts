import { Router } from 'express';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import * as S from '../../shared/schema';
import { approveDraft, formatRM, prepareSelfBilled, releaseDraft, toMyInvoisUbl, validateSelfBilled, type Buyer, type SelfBilledDraft } from '../../shared/core';
import type { AppDeps } from '../app';
import { ApiError } from '../app';
import { requireAuth, requireCan } from '../auth';
import { logEvent } from '../events';
import { adjustmentsCsv, buildAccountingPayload, connectorFromEnv } from '../accounting';
import { myInvoisConfigured, submitToMyInvois } from '../myinvois';
import { seedDatabase } from '../seed';
import { dmy as dmyKl } from '../core-adapters';

const csvCell = (v: string | number | null | undefined) => {
  let s = v === null || v === undefined ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; // spreadsheet formula injection guard
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const rm = (sen: number) => formatRM(sen).replace('RM', '');
const dmy = (d: Date | null) => (d ? dmyKl(d) : '');
const isoDmy = (s: string | null) => (s ? s.split('-').reverse().join('/') : '');

export function extrasRouter(deps: AppDeps) {
  const r = Router();
  const { db } = deps;
  r.use(['/invoices', '/export.csv', '/accounting', '/dev', '/checks', '/shop'], requireAuth);

  r.get('/checks', async (_req, res) => {
    const [row] = await db.select().from(S.settings).where(eq(S.settings.key, 'checks_left'));
    res.json({ checksLeft: Number(row?.value ?? 0), demo: process.env.DEMO_FIXTURES === '1' || process.env.NODE_ENV !== 'production' });
  });

  // ----- self-billed e-invoice preview (never submitted anywhere) -----
  const loadDraft = async (invoiceId: string) => {
    const [row] = await db.select().from(S.einvoiceDrafts).where(eq(S.einvoiceDrafts.invoiceId, invoiceId));
    return row;
  };
  const asDraft = (row: typeof S.einvoiceDrafts.$inferSelect): SelfBilledDraft => ({ ...(row.fields as { fields: SelfBilledDraft['fields'] }), supplierId: (row.fields as any).supplierId, invoiceId: row.invoiceId, status: row.status as SelfBilledDraft['status'], label: 'Preview, not submitted to LHDN' } as SelfBilledDraft);
  const save = async (d: SelfBilledDraft) => {
    const [out] = await db.update(S.einvoiceDrafts).set({ status: d.status, updatedAt: new Date() }).where(eq(S.einvoiceDrafts.invoiceId, d.invoiceId)).returning();
    return out;
  };

  /** A draft that is not yet approved always carries the CURRENT company details (the owner may have just filled them in). */
  const freshBuyer = async (row: typeof S.einvoiceDrafts.$inferSelect) => {
    if (row.status !== 'draft') return row;
    const [shop] = await db.select().from(S.settings).where(eq(S.settings.key, 'shop'));
    const s = (shop?.value ?? {}) as Record<string, string>;
    const buyer: Buyer = { name: s.name ?? '', tin: s.tin ?? '', brn: s.brn ?? '', address: s.address ?? '', msic: s.msic };
    const stored = row.fields as { supplierId: string; fields: SelfBilledDraft['fields'] };
    if (JSON.stringify(stored.fields.buyer) === JSON.stringify(buyer)) return row;
    const fields = { ...stored, fields: { ...stored.fields, buyer } };
    const [out] = await db.update(S.einvoiceDrafts).set({ fields, updatedAt: new Date() }).where(eq(S.einvoiceDrafts.invoiceId, row.invoiceId)).returning();
    return out;
  };
  r.get('/invoices/:id/einvoice', requireCan('approve_einvoice'), async (req, res) => {
    const found = await loadDraft(String(req.params.id));
    const row = found ? await freshBuyer(found) : undefined;
    res.json({ draft: row ? asDraft(row) : null, issues: row ? validateSelfBilled(asDraft(row)) : [], submission: row?.submission ?? null, myinvois: { configured: myInvoisConfigured(), env: process.env.MYINVOIS_ENV === 'production' ? 'production' : 'sandbox' } });
  });

  r.post('/invoices/:id/einvoice', requireCan('approve_einvoice'), async (req, res) => {
    const id = String(req.params.id);
    const existing = await loadDraft(id);
    if (existing) { res.json({ draft: asDraft(existing) }); return; }
    const [inv] = await db.select().from(S.invoices).where(eq(S.invoices.id, id));
    if (!inv) throw new ApiError(404, 'not_found', 'Invois tiada');
    const [sup] = await db.select().from(S.suppliers).where(eq(S.suppliers.id, inv.supplierId));
    const lines = await db.select().from(S.invoiceLines).where(eq(S.invoiceLines.invoiceId, id)).orderBy(S.invoiceLines.position);
    const [shop] = await db.select().from(S.settings).where(eq(S.settings.key, 'shop'));
    const s = (shop?.value ?? {}) as Record<string, string>;
    const buyer: Buyer = { name: s.name ?? '', tin: s.tin ?? '', brn: s.brn ?? '', address: s.address ?? '', msic: s.msic };
    const draft = prepareSelfBilled({ id: sup.id, name: sup.name, isForeign: sup.isForeign, country: sup.country ?? undefined },
      { id, invoiceNo: inv.invoiceNo, issuedAt: inv.issuedAt.getTime(), currency: inv.currency, exchangeRateToMYR: inv.exchangeRateBp ? inv.exchangeRateBp / 10000 : undefined,
        lines: lines.map(l => ({ description: l.description, qty: l.qty, unitPriceSen: l.unitPriceForeignMinor ?? l.unitPriceSen })) }, buyer);
    if (!draft) throw new ApiError(422, 'not_foreign', 'Hanya untuk pembekal luar negara');
    await db.insert(S.einvoiceDrafts).values({ id: `ei_${nanoid(10)}`, invoiceId: id, status: draft.status, fields: { supplierId: draft.supplierId, fields: draft.fields } });
    await logEvent(db, req.role!, 'einvoice.prepare', id);
    res.status(201).json({ draft });
  });

  r.post('/invoices/:id/einvoice/approve', requireCan('approve_einvoice'), async (req, res) => {
    const row = await loadDraft(String(req.params.id));
    if (!row) throw new ApiError(404, 'not_found', 'Draf tiada');
    let next; try { next = approveDraft(asDraft(row), req.role!); } catch (e) { throw new ApiError(409, 'bad_state', (e as Error).message); }
    await save(next);
    await logEvent(db, req.role!, 'einvoice.approve', row.invoiceId);
    res.json({ draft: next });
  });

  r.post('/invoices/:id/einvoice/release', requireCan('release_einvoice'), async (req, res) => {
    const row = await loadDraft(String(req.params.id));
    if (!row) throw new ApiError(404, 'not_found', 'Draf tiada');
    let out; try { out = releaseDraft(asDraft(row), req.role!, Date.now()); } catch (e) { throw new ApiError(409, 'bad_state', (e as Error).message); }
    await save(out.draft);
    await logEvent(db, req.role!, out.event.what, row.invoiceId); // log only: no network call
    res.json({ draft: out.draft });
  });

  // company details used as the BUYER on self-billed e-invoices (owner edits them in Settings)
  r.get('/shop', requireCan('approve_einvoice'), async (_req, res) => {
    const [shop] = await db.select().from(S.settings).where(eq(S.settings.key, 'shop'));
    const v = (shop?.value ?? {}) as Record<string, string>;
    res.json({ name: v.name ?? '', address: v.address ?? '', tin: v.tin ?? '', brn: v.brn ?? '', msic: v.msic ?? '' });
  });
  r.patch('/shop', requireCan('approve_einvoice'), async (req, res) => {
    const body = z.object({ name: z.string().trim().max(120).optional(), address: z.string().trim().max(300).optional(), tin: z.string().trim().max(30).optional(), brn: z.string().trim().max(30).optional(), msic: z.string().trim().max(10).optional() }).safeParse(req.body);
    if (!body.success || !Object.keys(body.data).length) throw new ApiError(400, 'bad_request', 'Data tidak sah');
    const [shop] = await db.select().from(S.settings).where(eq(S.settings.key, 'shop'));
    const value = { ...((shop?.value ?? {}) as Record<string, unknown>), ...body.data };
    await db.insert(S.settings).values({ key: 'shop', value }).onConflictDoUpdate({ target: S.settings.key, set: { value } });
    await logEvent(db, req.role!, 'shop.update', null, { fields: Object.keys(body.data) });
    res.json({ ok: true });
  });

  // MyInvois: the approved draft as a real UBL 2.1 JSON document (always downloadable); submission only when credentials are configured.
  const approvedDoc = async (invoiceId: string) => {
    const row = await loadDraft(invoiceId);
    if (!row) throw new ApiError(404, 'not_found', 'Draf tiada');
    if (row.status === 'draft') throw new ApiError(409, 'bad_state', 'Luluskan draf dahulu');
    const d = asDraft(row);
    return { row, d, ubl: toMyInvoisUbl(d, new Date()) };
  };
  r.get('/invoices/:id/einvoice/myinvois.json', requireCan('approve_einvoice'), async (req, res) => {
    const { d, ubl } = await approvedDoc(String(req.params.id));
    await logEvent(db, req.role!, 'einvoice.download', d.invoiceId);
    res.set({ 'Content-Type': 'application/json; charset=utf-8', 'Content-Disposition': `attachment; filename="${d.fields.eInvoiceNo}.myinvois.json"` }).send(JSON.stringify(ubl, null, 2));
  });
  r.post('/invoices/:id/einvoice/submit', requireCan('release_einvoice'), async (req, res) => {
    if (!myInvoisConfigured()) throw new ApiError(409, 'not_configured', 'Sambungan MyInvois belum dikonfigurasikan (MYINVOIS_CLIENT_ID / MYINVOIS_CLIENT_SECRET)');
    const { row, d, ubl } = await approvedDoc(String(req.params.id));
    if ((row.submission as { ok?: boolean } | null)?.ok) throw new ApiError(409, 'already_submitted', 'Sudah dihantar');
    const issues = validateSelfBilled(d);
    if (issues.length) throw new ApiError(422, 'incomplete', 'Butiran e-invois belum lengkap', { issues });
    const result = await submitToMyInvois(ubl, d.fields.eInvoiceNo);
    await db.update(S.einvoiceDrafts).set({ submission: { ...result, at: new Date().toISOString() }, updatedAt: new Date() }).where(eq(S.einvoiceDrafts.invoiceId, row.invoiceId));
    await logEvent(db, req.role!, result.ok ? 'einvoice.submit' : 'einvoice.submit_failed', row.invoiceId, { env: result.env, ok: result.ok, detail: result.detail, submissionUid: result.submissionUid });
    res.status(result.ok ? 200 : 502).json({ result });
  });

  // ----- CSV for the accountant: one row per invoice x approved flag (invoices without flags get one row) -----
  r.get('/export.csv', requireCan('export_csv'), async (req, res) => {
    const invs = await db.select().from(S.invoices).orderBy(S.invoices.issuedAt);
    const sups = await db.select().from(S.suppliers);
    const flags = (await db.select().from(S.flags)).filter(f => f.stage === 'invoice' && f.status !== 'proposed' && f.status !== 'dismissed');
    const lines = await db.select().from(S.invoiceLines);
    const head = ['Supplier', 'Invoice no', 'Invoice date', 'Printed date (Tarikh cetak)', 'Currency', 'Invoice total (RM)', 'Payment', 'Flag type', 'Item', 'Flag amount (RM)', 'Flag status', 'Request', 'Settlement', 'Accepted by supplier (RM)', 'Supplier reference'];
    const out = [head.map(csvCell).join(',')];
    for (const i of invs) {
      const sup = sups.find(s => s.id === i.supplierId)?.name ?? '';
      const base = [sup, i.invoiceNo, dmy(i.issuedAt), isoDmy(i.docDate), i.currency, rm(i.totalSen), i.payment === 'paid' ? 'Paid' : 'Unpaid'];
      const fl = flags.filter(f => f.invoiceId === i.id);
      if (!fl.length) out.push([...base, '', '', '', '', '', '', '', ''].map(csvCell).join(','));
      for (const f of fl) out.push([...base, f.type, lines.find(l => l.invoiceId === i.id && l.lineId === f.invoiceLineId)?.description ?? '', rm(f.amountSen), f.status, f.request ?? '', f.settlement ?? '', f.acceptedSen != null ? rm(f.acceptedSen) : '', f.settlementRef ?? ''].map(csvCell).join(','));
    }
    await logEvent(db, req.role!, 'export.csv', null);
    res.set({ 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="tepat-bill-export.csv"' }).send('\ufeff' + out.join('\r\n') + '\r\n');
  });

  // ----- accounting-partner handoff: the connector is a SIMULATION unless ACCOUNTING_WEBHOOK_URL + _SECRET are set (see server/accounting.ts) -----
  r.get('/accounting/payload', requireCan('export_csv'), async (_req, res) => { res.json({ mode: connectorFromEnv().mode, payload: await buildAccountingPayload(db) }); });
  r.get('/accounting/adjustments.csv', requireCan('export_csv'), async (req, res) => {
    await logEvent(db, req.role!, 'export.adjustments', null);
    res.set({ 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="tepat-bill-supplier-adjustments.csv"' }).send(adjustmentsCsv(await buildAccountingPayload(db)));
  });
  r.post('/accounting/handoff', requireCan('export_csv'), async (req, res) => {
    const payload = await buildAccountingPayload(db);
    const result = await connectorFromEnv().send(payload);
    await logEvent(db, req.role!, result.mode === 'webhook' ? 'accounting.handoff' : 'accounting.handoff_sim', null,
      { mode: result.mode, ok: result.ok, suppliers: payload.suppliers.length, invoices: payload.suppliers.reduce((a, s) => a + s.invoices.length, 0), approvedFlags: payload.suppliers.reduce((a, s) => a + s.flags.length, 0) });
    res.json({ ...result, simulated: result.mode === 'simulated', invoices: payload.suppliers.reduce((a, s) => a + s.invoices.length, 0), approvedFlags: payload.suppliers.reduce((a, s) => a + s.flags.length, 0) });
  });

  // ----- demo reset (dev, or a production deployment running in demo mode with DEMO_FIXTURES=1) -----
  r.post('/dev/reset', requireCan('edit_supplier'), async (req, res) => {
    if (process.env.NODE_ENV === 'production' && process.env.DEMO_FIXTURES !== '1') throw new ApiError(404, 'not_found', 'Tiada');
    await seedDatabase(db, deps.storage, Date.now(), { quiet: true });
    await logEvent(db, req.role!, 'demo.reset', null);
    res.json({ ok: true });
  });
  return r;
}

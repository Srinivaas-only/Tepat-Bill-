import { Router } from 'express';
import { eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import * as S from '../../shared/schema';
import { approveDraft, formatRM, prepareSelfBilled, releaseDraft, type Buyer, type SelfBilledDraft } from '../../shared/core';
import type { AppDeps } from '../app';
import { ApiError } from '../app';
import { requireAuth, requireCan } from '../auth';
import { logEvent } from '../events';
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
  r.use(['/invoices', '/export.csv', '/accounting', '/dev', '/checks'], requireAuth);

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

  r.get('/invoices/:id/einvoice', requireCan('approve_einvoice'), async (req, res) => {
    const row = await loadDraft(String(req.params.id));
    res.json({ draft: row ? asDraft(row) : null });
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

  // ----- CSV for the accountant: one row per invoice x approved flag (invoices without flags get one row) -----
  r.get('/export.csv', requireCan('export_csv'), async (req, res) => {
    const invs = await db.select().from(S.invoices).orderBy(S.invoices.issuedAt);
    const sups = await db.select().from(S.suppliers);
    const flags = (await db.select().from(S.flags)).filter(f => f.stage === 'invoice' && f.status !== 'proposed' && f.status !== 'dismissed');
    const lines = await db.select().from(S.invoiceLines);
    const head = ['Supplier', 'Invoice no', 'Invoice date', 'Printed date (Tarikh cetak)', 'Currency', 'Invoice total (RM)', 'Payment', 'Flag type', 'Item', 'Flag amount (RM)', 'Flag status', 'Request', 'Settlement'];
    const out = [head.map(csvCell).join(',')];
    for (const i of invs) {
      const sup = sups.find(s => s.id === i.supplierId)?.name ?? '';
      const base = [sup, i.invoiceNo, dmy(i.issuedAt), isoDmy(i.docDate), i.currency, rm(i.totalSen), i.payment === 'paid' ? 'Paid' : 'Unpaid'];
      const fl = flags.filter(f => f.invoiceId === i.id);
      if (!fl.length) out.push([...base, '', '', '', '', '', ''].map(csvCell).join(','));
      for (const f of fl) out.push([...base, f.type, lines.find(l => l.invoiceId === i.id && l.lineId === f.invoiceLineId)?.description ?? '', rm(f.amountSen), f.status, f.request ?? '', f.settlement ?? ''].map(csvCell).join(','));
    }
    await logEvent(db, req.role!, 'export.csv', null);
    res.set({ 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="tepat-bill-export.csv"' }).send('\ufeff' + out.join('\r\n') + '\r\n');
  });

  // ----- accounting-partner handoff: a labelled SIMULATION (no real API contract exists yet); it sends nothing anywhere, only summarises + logs -----
  r.post('/accounting/handoff-simulation', requireCan('export_csv'), async (req, res) => {
    const invs = await db.select({ id: S.invoices.id }).from(S.invoices);
    const flags = (await db.select().from(S.flags)).filter(f => f.stage === 'invoice' && f.status !== 'proposed' && f.status !== 'dismissed');
    const recoveredSen = flags.filter(f => f.status === 'settled' && (f.settlement === 'credit_note' || f.settlement === 'deducted')).reduce((a, f) => a + (f.acceptedSen ?? f.amountSen), 0);
    const summary = { simulated: true, invoices: invs.length, approvedFlags: flags.length, recoveredSen };
    await logEvent(db, req.role!, 'accounting.handoff_sim', null, summary);
    res.json(summary);
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

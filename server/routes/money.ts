import { Router } from 'express';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import * as S from '../../shared/schema';
import { canMarkCorrect, orderState, supplierLedger, transition, type Settlement } from '../../shared/core';
import type { AppDeps } from '../app';
import { ApiError } from '../app';
import { requireAuth, requireCan } from '../auth';
import { logEvent } from '../events';
import { flagCoreToPatch, flagRowToCore, invoiceRowToCore } from '../core-adapters';
import { toViews } from '../flag-view';

export function moneyRouter(deps: AppDeps) {
  const r = Router();
  const { db } = deps;
  r.use(['/flags', '/suppliers', '/invoices'], requireAuth);

  const loadFlag = async (id: string) => {
    const [row] = await db.select().from(S.flags).where(eq(S.flags.id, id));
    if (!row) throw new ApiError(404, 'not_found', 'Aduan tiada');
    return row;
  };
  const move = async (id: string, to: 'open' | 'disputed' | 'settled', settlement?: Settlement) => {
    const row = await loadFlag(id);
    let next;
    try { next = transition(flagRowToCore(row), to, Date.now(), settlement); } catch (e) { throw new ApiError(409, 'bad_state', (e as Error).message); }
    const [out] = await db.update(S.flags).set(flagCoreToPatch(next)).where(eq(S.flags.id, id)).returning();
    return out;
  };

  r.post('/flags/:id/dispute', requireCan('dispute_flag'), async (req, res) => {
    const out = await move(String(req.params.id), 'disputed');
    await logEvent(db, req.role!, 'flag.dispute', out.id);
    res.json({ flag: (await toViews(db, [out]))[0] });
  });
  r.post('/flags/:id/reopen', requireCan('dispute_flag'), async (req, res) => {
    const out = await move(String(req.params.id), 'open');
    await logEvent(db, req.role!, 'flag.reopen', out.id);
    res.json({ flag: (await toViews(db, [out]))[0] });
  });
  r.post('/flags/:id/settle', requireCan('settle_flag'), async (req, res) => {
    const body = z.object({ settlement: z.enum(['redelivered', 'credit_note', 'deducted']) }).safeParse(req.body);
    if (!body.success) throw new ApiError(400, 'bad_request', 'Data tidak sah');
    const out = await move(String(req.params.id), 'settled', body.data.settlement);
    await logEvent(db, req.role!, `flag.settle.${body.data.settlement}`, out.id, { settlement: body.data.settlement });
    res.json({ flag: (await toViews(db, [out]))[0] });
  });

  r.patch('/invoices/:id/payment', requireCan('mark_paid'), async (req, res) => {
    const body = z.object({ payment: z.enum(['paid', 'on_credit']) }).safeParse(req.body);
    if (!body.success) throw new ApiError(400, 'bad_request', 'Data tidak sah');
    const [out] = await db.update(S.invoices).set({ payment: body.data.payment, paidAt: body.data.payment === 'paid' ? new Date() : null })
      .where(eq(S.invoices.id, String(req.params.id))).returning();
    if (!out) throw new ApiError(404, 'not_found', 'Invois tiada');
    await logEvent(db, req.role!, out.payment === 'paid' ? 'invoice.mark_paid' : 'invoice.mark_unpaid', out.id, { payment: out.payment });
    res.json({ ok: true, payment: out.payment, paidAt: out.paidAt?.getTime() ?? null });
  });

  r.post('/invoices/:id/mark-correct', requireCan('mark_correct'), async (req, res) => {
    const id = String(req.params.id);
    const fl = await db.select().from(S.flags).where(eq(S.flags.invoiceId, id));
    if (!canMarkCorrect(id, fl.map(f => flagRowToCore(f)))) throw new ApiError(409, 'unresolved_flags', 'Masih ada aduan belum selesai');
    const [out] = await db.update(S.invoices).set({ ownerMarkedCorrect: true }).where(eq(S.invoices.id, id)).returning();
    if (!out) throw new ApiError(404, 'not_found', 'Invois tiada');
    await logEvent(db, req.role!, 'invoice.mark_correct', id);
    res.json({ ok: true });
  });

  const ledgerFor = async (supplierId: string) => {
    const invRows = await db.select().from(S.invoices).where(eq(S.invoices.supplierId, supplierId));
    const flagRows = await db.select().from(S.flags).where(eq(S.flags.supplierId, supplierId));
    const flags = flagRows.map(f => flagRowToCore(f));
    const ledger = supplierLedger(supplierId, invRows.map(invoiceRowToCore), flags);
    return { invRows, flags, ledger };
  };

  r.get('/suppliers/ledgers', async (_req, res) => {
    const sups = await db.select().from(S.suppliers).orderBy(S.suppliers.name);
    const out = [];
    for (const s of sups) {
      const { ledger, flags } = await ledgerFor(s.id);
      out.push({ id: s.id, name: s.name, owedSen: ledger.owedSen, disputedSen: ledger.disputedSen, payNowSen: ledger.payNowSen, creditCarrySen: ledger.creditCarrySen,
        openFlags: flags.filter(f => f.status === 'open' || f.status === 'disputed').length });
    }
    res.json({ suppliers: out });
  });

  r.get('/suppliers/:id/ledger', async (req, res) => {
    const [sup] = await db.select().from(S.suppliers).where(eq(S.suppliers.id, String(req.params.id)));
    if (!sup) throw new ApiError(404, 'not_found', 'Pembekal tiada');
    const { invRows, flags, ledger } = await ledgerFor(sup.id);
    const invoices = invRows.sort((a, b) => b.issuedAt.getTime() - a.issuedAt.getTime()).map(i => {
      const row = ledger.rows.find(x => x.id === i.id);
      return { id: i.id, invoiceNo: i.invoiceNo, totalSen: i.totalSen, issuedAt: i.issuedAt.getTime(), dueAt: i.dueAt.getTime(), payment: i.payment, paidAt: i.paidAt?.getTime() ?? null,
        state: orderState(i.id, flags, i.ownerMarkedCorrect), canMarkCorrect: canMarkCorrect(i.id, flags), ledger: row ?? null };
    });
    res.json({ supplier: { id: sup.id, name: sup.name, whatsapp: sup.whatsapp, isForeign: sup.isForeign, policyNote: sup.policyNote }, ledger, invoices });
  });
  return r;
}

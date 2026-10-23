import { Router } from 'express';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import * as S from '../../shared/schema';
import { canMarkCorrect, orderState, transition, type Settlement } from '../../shared/core';
import type { AppDeps } from '../app';
import { ApiError } from '../app';
import { requireAuth, requireCan } from '../auth';
import { logEvent } from '../events';
import { flagCoreToPatch, flagRowToCore } from '../core-adapters';
import { lockParent, updateFlagAtomic } from '../flag-ops';
import { toViews } from '../flag-view';
import { ledgerFor as ledgerForDb } from '../ledger-data';

export function moneyRouter(deps: AppDeps) {
  const r = Router();
  const { db } = deps;
  r.use(['/flags', '/suppliers', '/invoices'], requireAuth);

  /** One transition + its event in one transaction; the status compare-and-set turns a lost race into a 409. */
  const move = (id: string, to: 'open' | 'disputed' | 'settled', role: 'owner' | 'staff', event: (out: typeof S.flags.$inferSelect) => [string, unknown?], opts: { settlement?: Settlement; note?: string } = {}) =>
    db.transaction(async tx => {
      const [row] = await tx.select().from(S.flags).where(eq(S.flags.id, id));
      if (!row) throw new ApiError(404, 'not_found', 'Aduan tiada');
      await lockParent(tx, row);
      let next;
      try { next = transition(flagRowToCore(row), to, Date.now(), opts.settlement); } catch (e) { throw new ApiError(409, 'bad_state', (e as Error).message); }
      const out = await updateFlagAtomic(tx, row, { ...flagCoreToPatch(next), ...(opts.note !== undefined ? { note: opts.note } : {}) });
      // goods that were redelivered after a short delivery now count as received
      if (to === 'settled' && opts.settlement === 'redelivered' && out.stage === 'delivery' && out.deliveryId && out.missingQty) {
        const lines = await tx.select().from(S.deliveryLines).where(eq(S.deliveryLines.deliveryId, out.deliveryId));
        const l = lines.find(x => x.lineId === out.invoiceLineId);
        const key = `line:${out.invoiceLineId}`;
        const saved = (await tx.select().from(S.deliveryCounts).where(eq(S.deliveryCounts.deliveryId, out.deliveryId))).find(c => c.key === key);
        const qty = (saved?.qty ?? l?.qty ?? 0) + out.missingQty;
        await tx.insert(S.deliveryCounts).values({ deliveryId: out.deliveryId, key, qty, recordedByRole: role })
          .onConflictDoUpdate({ target: [S.deliveryCounts.deliveryId, S.deliveryCounts.key], set: { qty, recordedByRole: role, recordedAt: new Date() } });
      }
      const [action, meta] = event(out);
      await logEvent(tx, role, action, out.id, meta);
      return out;
    });

  r.post('/flags/:id/dispute', requireCan('dispute_flag'), async (req, res) => {
    const body = z.object({ note: z.string().trim().max(500).optional() }).safeParse(req.body ?? {});
    if (!body.success) throw new ApiError(400, 'bad_request', 'Data tidak sah');
    const note = body.data.note || undefined;
    const out = await move(String(req.params.id), 'disputed', req.role!, () => ['flag.dispute', note ? { note } : undefined], { note });
    res.json({ flag: (await toViews(db, [out]))[0] });
  });
  r.post('/flags/:id/reopen', requireCan('dispute_flag'), async (req, res) => {
    const out = await move(String(req.params.id), 'open', req.role!, () => ['flag.reopen']);
    res.json({ flag: (await toViews(db, [out]))[0] });
  });
  r.post('/flags/:id/settle', requireCan('settle_flag'), async (req, res) => {
    const body = z.object({ settlement: z.enum(['redelivered', 'credit_note', 'deducted']) }).safeParse(req.body);
    if (!body.success) throw new ApiError(400, 'bad_request', 'Data tidak sah');
    const settlement = body.data.settlement;
    const out = await move(String(req.params.id), 'settled', req.role!, () => [`flag.settle.${settlement}`, { settlement }], { settlement });
    res.json({ flag: (await toViews(db, [out]))[0] });
  });

  r.patch('/invoices/:id/payment', requireCan('mark_paid'), async (req, res) => {
    const body = z.object({ payment: z.enum(['paid', 'on_credit']).optional(), paidAt: z.number().int().positive().optional(), dueAt: z.number().int().positive().optional() }).safeParse(req.body);
    if (!body.success || Object.keys(body.data).length === 0) throw new ApiError(400, 'bad_request', 'Data tidak sah');
    const id = String(req.params.id);
    const [cur] = await db.select().from(S.invoices).where(eq(S.invoices.id, id));
    if (!cur) throw new ApiError(404, 'not_found', 'Invois tiada');
    const patch: Partial<typeof S.invoices.$inferInsert> = {};
    const payment = body.data.payment ?? cur.payment as 'paid' | 'on_credit';
    if (payment !== cur.payment) patch.payment = payment;
    if (payment === 'paid') {
      // re-marking paid keeps the original paid date unless a new one is given
      const paidAt = body.data.paidAt !== undefined ? new Date(body.data.paidAt) : cur.paidAt ?? new Date();
      if (!cur.paidAt || paidAt.getTime() !== cur.paidAt.getTime()) patch.paidAt = paidAt;
    } else if (cur.paidAt) patch.paidAt = null;
    if (body.data.dueAt !== undefined && body.data.dueAt !== cur.dueAt.getTime()) patch.dueAt = new Date(body.data.dueAt);
    if (Object.keys(patch).length === 0) throw new ApiError(400, 'no_change', 'Tiada perubahan');
    const out = await db.transaction(async tx => {
      const [o] = await tx.update(S.invoices).set(patch).where(eq(S.invoices.id, id)).returning();
      await logEvent(tx, req.role!, patch.payment ? (o.payment === 'paid' ? 'invoice.mark_paid' : 'invoice.mark_unpaid') : patch.dueAt ? 'invoice.due_date' : 'invoice.paid_date', id, { payment: o.payment, dueAt: o.dueAt.getTime() });
      return o;
    });
    res.json({ ok: true, payment: out.payment, paidAt: out.paidAt?.getTime() ?? null, dueAt: out.dueAt.getTime() });
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

  const ledgerFor = (supplierId: string) => ledgerForDb(db, supplierId);
  const nextDue = (invs: (typeof S.invoices.$inferSelect)[]) => {
    const due = invs.filter(i => i.payment !== 'paid').map(i => i.dueAt.getTime());
    return due.length ? Math.min(...due) : null;
  };

  r.get('/suppliers/ledgers', async (_req, res) => {
    const sups = await db.select().from(S.suppliers).orderBy(S.suppliers.name);
    const out = [];
    for (const s of sups) {
      const { ledger, flags, invRows } = await ledgerFor(s.id);
      out.push({ id: s.id, name: s.name, owedSen: ledger.owedSen, disputedSen: ledger.disputedSen, payNowSen: ledger.payNowSen, creditCarrySen: ledger.creditCarrySen,
        openFlags: flags.filter(f => f.status === 'open' || f.status === 'disputed').length, nextDueAt: nextDue(invRows) });
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
    res.json({ supplier: { id: sup.id, name: sup.name, whatsapp: sup.whatsapp, isForeign: sup.isForeign, country: sup.country, policyNote: sup.policyNote }, ledger, invoices, nextDueAt: nextDue(invRows) });
  });
  return r;
}

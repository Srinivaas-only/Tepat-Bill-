import { Router } from 'express';
import { desc, eq, inArray, sql } from 'drizzle-orm';
import * as S from '../../shared/schema';
import { last30Days } from '../../shared/core';
import type { AppDeps } from '../app';
import { requireAuth } from '../auth';
import { flagRowToCore } from '../core-adapters';
import { reminderDueIds, toViews } from '../flag-view';
import { ledgerFor } from '../ledger-data';
import { stateOf } from '../delivery-state';

export function homeRouter(deps: AppDeps) {
  const r = Router();
  const { db } = deps;
  r.use(['/home', '/activity'], requireAuth);

  r.get('/home', async (_req, res) => {
    const now = Date.now();
    const invoiceFlags = await db.select().from(S.flags).where(eq(S.flags.stage, 'invoice')); // money: never capped
    const all = await db.select().from(S.flags).orderBy(desc(S.flags.createdAt)).limit(500); // work lists only
    // money (summary) sees invoice-stage flags only; work lists skip flags a later invoice superseded
    const rows = all.filter(f => !f.supersededBy);
    const summary = last30Days(invoiceFlags.map(f => flagRowToCore(f)), now);
    const proposed = rows.filter(f => f.status === 'proposed').sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    const dueIds = await reminderDueIds(db, rows, now);
    const due = rows.filter(f => dueIds.has(f.id));
    const follow = due.sort((a, b) => (a.sentAt ?? a.openedAt ?? a.createdAt).getTime() - (b.sentAt ?? b.openedAt ?? b.createdAt).getTime());
    const [needsAction, followUps] = await Promise.all([toViews(db, proposed.slice(0, 5)), toViews(db, follow.slice(0, 5))]);
    // suppliers we owe a credit to, newest activity, delivery strip, scans left
    const ledgers = await Promise.all((await db.select().from(S.suppliers)).map(async s => ({ s, l: (await ledgerFor(db, s.id)).ledger })));
    const credits = ledgers.filter(x => x.l.creditCarrySen > 0).map(x => ({ id: x.s.id, name: x.s.name, creditSen: x.l.creditCarrySen }));
    const ev = await db.select().from(S.events).orderBy(desc(S.events.at), desc(S.events.id)).limit(5);
    const recent = ev.map(e => ({ id: e.id, at: e.at.getTime(), role: e.role, action: e.action, ref: e.ref, meta: e.meta }));
    const dels = await db.select({ d: S.deliveries, supplierName: S.suppliers.name }).from(S.deliveries).innerJoin(S.suppliers, eq(S.suppliers.id, S.deliveries.supplierId)).orderBy(desc(S.deliveries.receivedAt)).limit(5);
    const dflags = dels.length ? await db.select().from(S.flags).where(inArray(S.flags.deliveryId, dels.map(x => x.d.id))) : [];
    const deliveries = dels.map(x => {
      const all = dflags.filter(f => f.deliveryId === x.d.id);
      const state = stateOf(x.d, all);
      return { id: x.d.id, doNo: x.d.doNo, supplierName: x.supplierName, receivedAt: x.d.receivedAt.getTime(), invoiceId: x.d.invoiceId, state };
    });
    const [checks] = await db.select().from(S.settings).where(eq(S.settings.key, 'checks_left'));
    const [{ n: invoiceCount }] = await db.select({ n: sql<number>`count(*)::int` }).from(S.invoices);
    res.json({ summary, needsActionCount: proposed.length, needsAction, followUpCount: follow.length, followUps, credits, recent, deliveries, checksLeft: Number(checks?.value ?? 0), firstRun: invoiceCount === 0 });
  });

  r.get('/activity', async (_req, res) => {
    const ev = await db.select().from(S.events).orderBy(desc(S.events.at), desc(S.events.id)).limit(100);
    res.json({ events: ev.map(e => ({ id: e.id, at: e.at.getTime(), role: e.role, action: e.action, ref: e.ref, meta: e.meta })) });
  });
  return r;
}

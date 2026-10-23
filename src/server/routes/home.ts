import { Router } from 'express';
import { desc, eq, inArray, and, gte } from 'drizzle-orm';
import * as S from '../../shared/schema';
import { last30Days, needsReminder } from '../../shared/core';
import type { AppDeps } from '../app';
import { requireAuth } from '../auth';
import { flagRowToCore } from '../core-adapters';
import { toViews } from '../flag-view';

const DAY = 86_400_000;

export function homeRouter(deps: AppDeps) {
  const r = Router();
  const { db } = deps;
  r.use(['/home', '/activity'], requireAuth);

  r.get('/home', async (_req, res) => {
    const now = Date.now();
    const rows = await db.select().from(S.flags);
    const core = rows.map(f => flagRowToCore(f));
    const summary = last30Days(core, now);
    const proposed = rows.filter(f => f.status === 'proposed').sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    // a reminder draft hides the flag from "follow up" for 14 days
    const due = rows.filter(f => needsReminder(flagRowToCore(f), now));
    const recent = due.length ? await db.select({ ref: S.events.ref }).from(S.events)
      .where(and(eq(S.events.action, 'flag.remind'), inArray(S.events.ref, due.map(f => f.id)), gte(S.events.at, new Date(now - 14 * DAY)))) : [];
    const hidden = new Set(recent.map(e => e.ref));
    const follow = due.filter(f => !hidden.has(f.id)).sort((a, b) => (a.sentAt ?? a.openedAt ?? a.createdAt).getTime() - (b.sentAt ?? b.openedAt ?? b.createdAt).getTime());
    const [needsAction, followUps] = await Promise.all([toViews(db, proposed.slice(0, 5)), toViews(db, follow.slice(0, 5))]);
    res.json({ summary, needsActionCount: proposed.length, needsAction, followUpCount: follow.length, followUps });
  });

  r.get('/activity', async (_req, res) => {
    const ev = await db.select().from(S.events).orderBy(desc(S.events.at), desc(S.events.id)).limit(100);
    res.json({ events: ev.map(e => ({ id: e.id, at: e.at.getTime(), role: e.role, action: e.action, ref: e.ref, meta: e.meta })) });
  });
  return r;
}

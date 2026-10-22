import type { Db } from './db';
import * as S from '../shared/schema';
import type { Role } from '../shared/core';

/** Every write inserts an events row (activity log). */
export async function logEvent(db: Pick<Db, 'insert'>, role: Role, action: string, ref: string | null, meta?: unknown, at?: Date) {
  await db.insert(S.events).values({ role, action, ref, meta: meta ?? null, ...(at ? { at } : {}) });
}

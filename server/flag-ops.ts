import { and, eq, sql } from 'drizzle-orm';
import * as S from '../shared/schema';
import type { FlagRequest, FlagType } from '../shared/core';
import type { Db } from './db';
import { ApiError } from './app';

export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];
export type FlagRowT = typeof S.flags.$inferSelect;

/** Notes 25: allowed requests per type, first is the default. */
export const REQUESTS: Record<FlagType, FlagRequest[]> = {
  short_qty: ['deduct', 'send_missing'],
  price_change: ['agreed_price', 'deduct'],
  not_ordered: ['collect_back', 'deduct'],
};
/** At delivery nothing is billed yet, so the natural asks come first. */
export const DELIVERY_REQUESTS: Partial<Record<FlagType, FlagRequest[]>> = {
  short_qty: ['send_missing', 'deduct'],
  not_ordered: ['collect_back', 'deduct'],
};
export const requestsFor = (row: Pick<FlagRowT, 'type' | 'stage'>): FlagRequest[] =>
  (row.stage === 'delivery' ? DELIVERY_REQUESTS[row.type as FlagType] : undefined) ?? REQUESTS[row.type as FlagType];

/** Compare-and-set on status: if another request already moved the flag, nothing updates and the caller gets a 409. */
export async function updateFlagAtomic(tx: Pick<Db, 'update'>, row: Pick<FlagRowT, 'id' | 'status'>, patch: Partial<typeof S.flags.$inferInsert>): Promise<FlagRowT> {
  const [out] = await tx.update(S.flags).set(patch).where(and(eq(S.flags.id, row.id), eq(S.flags.status, row.status))).returning();
  if (!out) throw new ApiError(409, 'bad_state', 'Aduan ini sudah diproses');
  return out;
}

/** Serialise concurrent writers of one invoice / delivery. */
export const lockInvoice = (tx: Pick<Db, 'execute'>, id: string) => tx.execute(sql`select id from invoices where id = ${id} for update`);
export const lockDelivery = (tx: Pick<Db, 'execute'>, id: string) => tx.execute(sql`select id from deliveries where id = ${id} for update`);
export const lockParent = (tx: Pick<Db, 'execute'>, row: Pick<FlagRowT, 'invoiceId' | 'deliveryId'>) =>
  row.invoiceId ? lockInvoice(tx, row.invoiceId) : row.deliveryId ? lockDelivery(tx, row.deliveryId) : Promise.resolve();

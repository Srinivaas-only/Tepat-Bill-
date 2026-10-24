import { eq } from 'drizzle-orm';
import * as S from '../shared/schema';
import { supplierLedger } from '../shared/core';
import type { Db } from './db';
import { flagRowToCore, invoiceRowToCore } from './core-adapters';

/** Ledger inputs: ONLY invoice-stage flags move money; delivery estimates never enter. */
export async function ledgerFor(db: Pick<Db, 'select'>, supplierId: string) {
  const invRows = await db.select().from(S.invoices).where(eq(S.invoices.supplierId, supplierId));
  const flagRows = (await db.select().from(S.flags).where(eq(S.flags.supplierId, supplierId))).filter(f => f.stage === 'invoice');
  const flags = flagRows.map(f => flagRowToCore(f));
  const ledger = supplierLedger(supplierId, invRows.map(invoiceRowToCore), flags);
  return { invRows, flags, ledger };
}

// Idempotent, additive schema upgrade run at every boot. A redeploy that pulls new code but does not run `npm run db:push`
// would otherwise break every query that selects a newly added column. Everything here is IF NOT EXISTS / IF EXISTS and only ADDS.
import { sql } from 'drizzle-orm';
import type { Db } from './db';

export const UPGRADES: string[] = [
  `ALTER TABLE received_counts ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'staff'`,
  `ALTER TABLE flags ADD COLUMN IF NOT EXISTS needs_recheck boolean NOT NULL DEFAULT false`,
  `ALTER TABLE flags ADD COLUMN IF NOT EXISTS parent_flag_id text`,
  `ALTER TABLE flags ADD COLUMN IF NOT EXISTS accepted_sen integer`,
  `ALTER TABLE flags ADD COLUMN IF NOT EXISTS settlement_ref text`,
  `ALTER TABLE flags ADD COLUMN IF NOT EXISTS settlement_note text`,
  `ALTER TABLE einvoice_drafts ADD COLUMN IF NOT EXISTS submission jsonb`,
  // residue flags (partial acceptance) share the line/type of their parent, so the unique index must ignore them
  `CREATE UNIQUE INDEX IF NOT EXISTS flags_invoice_line_type_root_uq ON flags (invoice_id, invoice_line_id, type) WHERE stage = 'invoice' AND parent_flag_id IS NULL`,
  `DROP INDEX IF EXISTS flags_invoice_line_type_uq`,
];

export async function upgradeSchema(db: Pick<Db, 'execute'>): Promise<{ ok: number; failed: string[] }> {
  let ok = 0; const failed: string[] = [];
  for (const stmt of UPGRADES) {
    try { await db.execute(sql.raw(stmt)); ok++; }
    catch (e) { failed.push(`${stmt.slice(0, 70)}… ${(e as Error).message}`); }
  }
  if (failed.length) console.warn(`[schema] ${failed.length} upgrade step(s) failed (run \`npm run db:push\`):\n  ${failed.join('\n  ')}`);
  else console.log(`[schema] up to date (${ok} checks)`);
  return { ok, failed };
}

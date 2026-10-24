import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { makeDb } from '../../src/server/db';
import { upgradeSchema } from '../../src/server/schema-upgrade';

const SCHEMA = 'test_upg';
describe.skipIf(!process.env.DATABASE_URL)('boot schema upgrade (a redeploy without db:push)', () => {
  let pool: ReturnType<typeof makeDb>['pool']; let db: ReturnType<typeof makeDb>['db'];
  beforeAll(async () => {
    const admin = makeDb();
    await admin.pool.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`); await admin.pool.query(`CREATE SCHEMA ${SCHEMA}`);
    for (const t of ['received_counts', 'flags', 'einvoice_drafts']) await admin.pool.query(`CREATE TABLE ${SCHEMA}."${t}" (LIKE public."${t}" INCLUDING ALL)`);
    // put the tables back into their OLD shape
    for (const q of ['ALTER TABLE received_counts DROP COLUMN source', 'ALTER TABLE flags DROP COLUMN needs_recheck, DROP COLUMN parent_flag_id, DROP COLUMN accepted_sen, DROP COLUMN settlement_ref, DROP COLUMN settlement_note', 'ALTER TABLE einvoice_drafts DROP COLUMN submission'])
      await admin.pool.query(`SET search_path=${SCHEMA}; ${q}`);
    await admin.pool.end();
    ({ db, pool } = makeDb(undefined, SCHEMA));
  });
  afterAll(async () => { await pool.end(); });
  const cols = async (t: string) => (await pool.query(`select column_name from information_schema.columns where table_schema=$1 and table_name=$2`, [SCHEMA, t])).rows.map((r: any) => r.column_name);
  it('adds every missing column and the new index, and is safe to run twice', async () => {
    expect(await cols('flags')).not.toContain('needs_recheck');
    const r1 = await upgradeSchema(db);
    expect(r1.failed).toEqual([]);
    expect(await cols('flags')).toEqual(expect.arrayContaining(['needs_recheck', 'parent_flag_id', 'accepted_sen', 'settlement_ref', 'settlement_note']));
    expect(await cols('received_counts')).toContain('source');
    expect(await cols('einvoice_drafts')).toContain('submission');
    const idx = (await pool.query(`select indexname from pg_indexes where schemaname=$1 and tablename='flags'`, [SCHEMA])).rows.map((r: any) => r.indexname);
    expect(idx).toContain('flags_invoice_line_type_root_uq');
    expect(idx).not.toContain('flags_invoice_line_type_uq');
    expect((await upgradeSchema(db)).failed).toEqual([]);
  });
});

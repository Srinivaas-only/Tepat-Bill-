import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from '../shared/schema';

export type Db = ReturnType<typeof makeDb>['db'];

/** Create a pool + drizzle instance. `pgSchema` pins search_path (used by API tests so dev data is never touched). */
export function makeDb(url = process.env.DATABASE_URL, pgSchema?: string) {
  if (!url) throw new Error('DATABASE_URL is not set');
  const pool = new pg.Pool({
    connectionString: url, max: 8, connectionTimeoutMillis: 10_000, idleTimeoutMillis: 30_000,
    options: pgSchema ? `-c search_path=${pgSchema}` : undefined,
  });
  pool.on('error', e => console.error('[pg] idle client error', e.message));
  const db = drizzle(pool, { schema });
  return { db, pool };
}

let shared: ReturnType<typeof makeDb> | undefined;
export const getDb = () => {
  if (!shared) {
    shared = makeDb();
    const s = shared;
    // keep a warm connection so the first request after idle does not pay a reconnect
    setInterval(() => { s.pool.query('select 1').catch(() => {}); }, 240_000).unref();
  }
  return shared;
};

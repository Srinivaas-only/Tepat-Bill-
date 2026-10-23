import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from '../shared/schema';

export type Db = ReturnType<typeof makeDb>['db'];

/** Create a pool + drizzle instance. `pgSchema` pins search_path (used by API tests so dev data is never touched). */
export function makeDb(url = process.env.DATABASE_URL, pgSchema?: string) {
  if (!url) throw new Error('DATABASE_URL is not set');
  const pool = new pg.Pool({ connectionString: url, max: 8, options: pgSchema ? `-c search_path=${pgSchema}` : undefined });
  const db = drizzle(pool, { schema });
  return { db, pool };
}

let shared: ReturnType<typeof makeDb> | undefined;
export const getDb = () => (shared ??= makeDb());

import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema.js';

export type DB = ReturnType<typeof drizzle<typeof schema>>;

/** Creates a Drizzle DB. SQLite now; postgres* URLs fail loud (seam only). */
export function createDb(url = process.env.DATABASE_URL ?? 'file:./data/app.sqlite'): DB {
  if (url.startsWith('postgres')) {
    throw new Error(
      'Postgres driver not yet implemented. Use a file: SQLite URL. ' +
      'The schema is single-file so a pg variant is an additive change.',
    );
  }
  const path = url.replace(/^file:/, '');
  const sqlite = new Database(path);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
  return drizzle(sqlite, { schema });
}

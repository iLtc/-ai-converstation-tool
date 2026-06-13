import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema.js';
import { applyMigrations } from './migrate.js';
import type { DB } from './client.js';

/** Fresh in-memory DB with migrations applied — for tests. */
export function createTestDb(): DB {
  const sqlite = new Database(':memory:');
  sqlite.pragma('foreign_keys = ON');
  const db = drizzle(sqlite, { schema });
  applyMigrations(db);
  return db;
}

/**
 * Fresh in-memory SQLite database for tests (tasks.md T013).
 *
 * Applies the same generated SQL migrations the app ships (src/data/db/migrations/*.sql), so tests
 * run against exactly the production schema, including CHECK constraints and cascades.
 */
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as fs from 'node:fs';
import * as path from 'node:path';

import * as schema from '@/data/db/schema';

const MIGRATIONS_DIR = path.resolve(__dirname, '../../src/data/db/migrations');

function migrationStatements(): string[] {
  return fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .flatMap((f) => fs.readFileSync(path.join(MIGRATIONS_DIR, f), 'utf8').split('--> statement-breakpoint'))
    .map((s) => s.trim())
    .filter(Boolean);
}

export function createTestDb() {
  const sqlite = new Database(':memory:');
  sqlite.pragma('foreign_keys = ON');
  for (const stmt of migrationStatements()) sqlite.exec(stmt);
  const db = drizzle(sqlite, { schema });
  return { db, sqlite, close: () => sqlite.close() };
}

export type TestDb = ReturnType<typeof createTestDb>['db'];

/**
 * The app's SQLite database (expo-sqlite + Drizzle).
 *
 * `useDbMigrations()` applies the bundled migrations at start-up (app/_layout.tsx waits for it).
 * Foreign keys are switched on for every connection so cascades and SET NULL actually run.
 */
import { drizzle } from 'drizzle-orm/expo-sqlite';
import { useMigrations } from 'drizzle-orm/expo-sqlite/migrator';
import { openDatabaseSync } from 'expo-sqlite';

import migrations from './migrations/migrations';
import * as schema from './schema';

export const DB_NAME = 'rifflect.db';

const sqlite = openDatabaseSync(DB_NAME, { enableChangeListener: true });
sqlite.execSync('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;');

export const db = drizzle(sqlite, { schema });

export type AppDb = typeof db;

export function useDbMigrations() {
  return useMigrations(db, migrations);
}

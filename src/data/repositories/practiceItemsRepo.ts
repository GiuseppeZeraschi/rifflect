/**
 * Practice items (labels) — tasks.md T069, data-model.md § PracticeItem.
 * Names: "1–60 chars, trimmed, unique ignoring case".
 */
import { desc, eq, sql } from 'drizzle-orm';

import { practiceItem, type PracticeItemRow } from '@/data/db/schema';
import type { Db } from '@/data/db/types';
import { newId } from '@/lib/ids';
import { nowIso } from '@/lib/time';

function cleanName(name: string): string {
  const n = name.trim().replace(/\s+/g, ' ');
  if (n.length < 1 || n.length > 60) throw new Error('Labels must be 1–60 characters');
  return n;
}

function byNameNoCase(db: Db, name: string): PracticeItemRow | undefined {
  return db.select().from(practiceItem).where(sql`lower(${practiceItem.name}) = lower(${name})`).get();
}

/** Most recently used first; never-used items last, alphabetically. */
export function listItems(db: Db): PracticeItemRow[] {
  return db
    .select()
    .from(practiceItem)
    .orderBy(sql`${practiceItem.lastUsedAt} IS NULL`, desc(practiceItem.lastUsedAt), sql`lower(${practiceItem.name})`)
    .all();
}

export function findOrCreateItem(db: Db, name: string): PracticeItemRow {
  const clean = cleanName(name);
  const existing = byNameNoCase(db, clean);
  if (existing) return existing;
  const id = newId();
  db.insert(practiceItem).values({ id, name: clean, createdAt: nowIso(), lastUsedAt: null }).run();
  return db.select().from(practiceItem).where(eq(practiceItem.id, id)).get()!;
}

export function renameItem(db: Db, id: string, name: string): PracticeItemRow {
  const clean = cleanName(name);
  const clash = byNameNoCase(db, clean);
  if (clash && clash.id !== id) throw new Error(`There’s already a label called “${clash.name}”`);
  db.update(practiceItem).set({ name: clean }).where(eq(practiceItem.id, id)).run();
  return db.select().from(practiceItem).where(eq(practiceItem.id, id)).get()!;
}

/** Deleting a label keeps its takes; they become unlabelled (FK ON DELETE SET NULL). */
export function deleteItem(db: Db, id: string): void {
  db.delete(practiceItem).where(eq(practiceItem.id, id)).run();
}

export function touchItem(db: Db, id: string): void {
  db.update(practiceItem).set({ lastUsedAt: nowIso() }).where(eq(practiceItem.id, id)).run();
}

/**
 * Take operations that touch both the database and the take's folder (tasks.md T070).
 * Files are removed after the row, so a crash in between leaves an orphan folder (harmless,
 * cleaned by recovery) rather than a row pointing at missing files.
 */
import type { Db } from '@/data/db/types';
import type { TakeFiles } from '@/data/files/takeFiles';
import { deleteTakeRow, getTake } from '@/data/repositories/takesRepo';

export function createTakeService({ db, files }: { db: Db; files: TakeFiles }) {
  return {
    /** Throw away an unsaved take: nothing is stored (Story 2 scenario 4). */
    discardDraft(id: string): void {
      const row = getTake(db, id);
      if (!row) return;
      if (row.saved) throw new Error('This take is saved; delete it instead of discarding it');
      deleteTakeRow(db, id);
      files.deleteTakeDir(id);
      files.deletePcmCache(id);
    },
    /** Delete a saved take with its report, points and files (Story 2 scenario 3). */
    deleteTake(id: string): void {
      deleteTakeRow(db, id);
      files.deleteTakeDir(id);
      files.deletePcmCache(id);
    },
  };
}

export type TakeService = ReturnType<typeof createTakeService>;

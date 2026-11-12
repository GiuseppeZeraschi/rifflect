/** Live library data: saved takes (with search), drafts, and storage numbers. */
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';

import { db } from '@/data/db/client';
import { takeFiles } from '@/data/files';
import { formatBytes, storageStatus } from '@/data/files/storage';
import { draftsQuery, libraryQuery, toDraftRows, withThumb } from '@/data/repositories/takesRepo';

export function useLibrary(search: string) {
  const saved = useLiveQuery(libraryQuery(db, { search }), [search]);
  const drafts = useLiveQuery(draftsQuery(db));
  const status = storageStatus(db, takeFiles);
  return {
    loaded: saved.updatedAt !== undefined,
    takes: withThumb(saved.data),
    drafts: toDraftRows(drafts.data),
    storage: { ...status, takesLabel: formatBytes(status.takesBytes), freeLabel: formatBytes(status.freeBytes) },
  };
}

/**
 * Storage accounting (tasks.md T072, FR-017): space used by takes, and low-space warnings before
 * recording and before saving.
 */
import { sql } from 'drizzle-orm';

import { take } from '@/data/db/schema';
import type { Db } from '@/data/db/types';
import type { TakeFiles } from './takeFiles';

const MB = 1024 * 1024;
/** Below this much free space, warn the user. */
export const LOW_SPACE_BYTES = 600 * MB;
/** Rough size of a 5-minute take (1080p video + audio + landmarks), used before recording. */
export const MAX_TAKE_ESTIMATE_BYTES = 250 * MB;

export function totalTakesBytes(db: Db): number {
  const row = db.select({ total: sql<number>`coalesce(sum(${take.fileSizeBytes}), 0)` }).from(take).get();
  return Number(row?.total ?? 0);
}

export function hasSpaceFor(files: Pick<TakeFiles, 'freeDiskBytes'>, bytes: number): boolean {
  return files.freeDiskBytes() >= bytes;
}

export interface StorageStatus {
  freeBytes: number;
  takesBytes: number;
  /** Free space below LOW_SPACE_BYTES. */
  low: boolean;
  /** Not enough room for a full 5-minute take. */
  cannotRecord: boolean;
}

export function storageStatus(db: Db, files: Pick<TakeFiles, 'freeDiskBytes'>): StorageStatus {
  const freeBytes = files.freeDiskBytes();
  return {
    freeBytes,
    takesBytes: totalTakesBytes(db),
    low: freeBytes < LOW_SPACE_BYTES,
    cannotRecord: freeBytes < MAX_TAKE_ESTIMATE_BYTES,
  };
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < MB) return `${Math.round(bytes / 1024)} KB`;
  if (bytes < 1024 * MB) return `${(bytes / MB).toFixed(bytes < 10 * MB ? 1 : 0)} MB`;
  return `${(bytes / (1024 * MB)).toFixed(1)} GB`;
}

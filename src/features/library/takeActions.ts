/**
 * App wiring for take actions (US2): save (with label and thumbnail), discard, delete, relabel.
 */
import { File } from 'expo-file-system';
import { getThumbnailAsync } from 'expo-video-thumbnails';

import { db } from '@/data/db/client';
import { takeFiles } from '@/data/files';
import { storageStatus } from '@/data/files/storage';
import { findOrCreateItem } from '@/data/repositories/practiceItemsRepo';
import { getTake, saveTake } from '@/data/repositories/takesRepo';
import { createTakeService } from '@/data/takeService';

export const takeService = createTakeService({ db, files: takeFiles });

/** Label choice: an existing item id, a new name to create, or none. */
export type LabelChoice = { itemId: string } | { newName: string } | null;

export function resolveLabel(choice: LabelChoice): string | null {
  if (!choice) return null;
  return 'itemId' in choice ? choice.itemId : findOrCreateItem(db, choice.newName).id;
}

/** Thumbnail at 1 s, copied into the take folder. Failure is harmless (the list shows a placeholder). */
async function makeThumbnail(takeId: string, videoPath: string): Promise<void> {
  try {
    const { uri } = await getThumbnailAsync(takeFiles.toAbsolute(videoPath), { time: 1000, quality: 0.6 });
    const target = new File(takeFiles.toAbsolute(takeFiles.relThumbPath(takeId)));
    if (target.exists) target.delete();
    new File(uri).move(target);
  } catch {
    // no thumbnail
  }
}

export interface SaveOutcome {
  /** Free space is low: the take was saved, but the user should be told. */
  lowSpace: boolean;
}

export async function saveTakeWithLabel(takeId: string, label: LabelChoice, title?: string | null): Promise<SaveOutcome> {
  const row = getTake(db, takeId);
  if (!row) throw new Error('This take no longer exists');
  saveTake(db, takeId, { practiceItemId: resolveLabel(label), ...(title !== undefined ? { title } : {}) });
  await makeThumbnail(takeId, row.videoPath);
  return { lowSpace: storageStatus(db, takeFiles).low };
}

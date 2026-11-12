/**
 * Takes repository (tasks.md T054; US2 extends it in T072). State machine: data-model.md § Take.
 */
import { eq } from 'drizzle-orm';

import {
  take,
  type AccompanimentSetting,
  type AnalysisStatus,
  type CameraPosition,
  type TakeRow,
} from '@/data/db/schema';
import type { Db } from '@/data/db/types';
import { relTakePaths } from '@/data/files/takePaths';
import { newId } from '@/lib/ids';
import { nowIso } from '@/lib/time';
import { getProfile } from './profileRepo';

/** Takes shorter than this aren't analysed (FR-004). */
export const MIN_ANALYSABLE_MS = 5_000;
/** Recording stops automatically at this length (FR-004). */
export const MAX_TAKE_MS = 300_000;

export interface NewTake {
  id?: string;
  cameraPosition: CameraPosition;
  accompanimentSetting: AccompanimentSetting;
  /** 30–300 */
  targetTempoBpm?: number | null;
  recordedAt?: string;
}

export function getTake(db: Db, id: string): TakeRow | undefined {
  return db.select().from(take).where(eq(take.id, id)).get();
}

function requireTake(db: Db, id: string): TakeRow {
  const row = getTake(db, id);
  if (!row) throw new Error(`Take ${id} not found`);
  return row;
}

export function createTake(db: Db, input: NewTake): TakeRow {
  const profile = getProfile(db);
  if (!profile) throw new Error('Cannot record before the player profile exists (finish onboarding first)');
  if (input.targetTempoBpm != null && (input.targetTempoBpm < 30 || input.targetTempoBpm > 300)) {
    throw new Error('Target tempo must be between 30 and 300 BPM');
  }
  const id = input.id ?? newId();
  const now = nowIso();
  db.insert(take)
    .values({
      id,
      recordedAt: input.recordedAt ?? now,
      cameraPosition: input.cameraPosition,
      targetTempoBpm: input.targetTempoBpm ?? null,
      accompanimentSetting: input.accompanimentSetting,
      handednessAtRecording: profile.handedness,
      skillLevelAtRecording: profile.skillLevel,
      videoPath: relTakePaths(id).video,
      captureStatus: 'recording',
      analysisStatus: 'pending',
      saved: false,
      interrupted: false,
      createdAt: now,
      updatedAt: now,
    })
    .run();
  return requireTake(db, id);
}

function analysisStatusForLength(durationMs: number): AnalysisStatus {
  return durationMs < MIN_ANALYSABLE_MS ? 'too_short' : 'pending';
}

export function completeCapture(
  db: Db,
  id: string,
  c: { durationMs: number; fileSizeBytes: number; landmarksPath: string | null },
): TakeRow {
  const durationMs = Math.min(Math.max(0, Math.round(c.durationMs)), MAX_TAKE_MS);
  db.update(take)
    .set({
      captureStatus: 'complete',
      durationMs,
      fileSizeBytes: c.fileSizeBytes,
      landmarksPath: c.landmarksPath,
      analysisStatus: analysisStatusForLength(durationMs),
      updatedAt: nowIso(),
    })
    .where(eq(take.id, id))
    .run();
  return requireTake(db, id);
}

/** Recording ended abnormally (phone call, app backgrounded, recovery after a crash). */
export function markInterrupted(db: Db, id: string, c: { durationMs?: number; fileSizeBytes?: number } = {}): TakeRow {
  const current = requireTake(db, id);
  const durationMs = Math.min(Math.max(0, Math.round(c.durationMs ?? current.durationMs)), MAX_TAKE_MS);
  db.update(take)
    .set({
      captureStatus: 'partial',
      interrupted: true,
      durationMs,
      fileSizeBytes: c.fileSizeBytes ?? current.fileSizeBytes,
      analysisStatus: analysisStatusForLength(durationMs),
      updatedAt: nowIso(),
    })
    .where(eq(take.id, id))
    .run();
  return requireTake(db, id);
}

export function setAnalysisStatus(db: Db, id: string, status: AnalysisStatus): void {
  db.update(take).set({ analysisStatus: status, updatedAt: nowIso() }).where(eq(take.id, id)).run();
}

/**
 * Keep a take (FR-015). "saved = true requires captureStatus = complete or interrupted = true".
 * US2 (T072) adds labels, lastUsedAt and the thumbnail.
 */
export function saveTake(db: Db, id: string, fields: { practiceItemId?: string | null; title?: string | null } = {}): TakeRow {
  const current = requireTake(db, id);
  if (current.captureStatus !== 'complete' && !current.interrupted) {
    throw new Error('This take is still recording and can’t be saved yet');
  }
  if (fields.title != null && fields.title.trim().length > 80) throw new Error('Titles can be at most 80 characters');
  db.update(take)
    .set({
      saved: true,
      ...(fields.practiceItemId !== undefined ? { practiceItemId: fields.practiceItemId } : {}),
      ...(fields.title !== undefined ? { title: fields.title?.trim() || null } : {}),
      updatedAt: nowIso(),
    })
    .where(eq(take.id, id))
    .run();
  return requireTake(db, id);
}

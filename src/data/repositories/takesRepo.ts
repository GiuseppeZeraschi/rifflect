/**
 * Takes repository (tasks.md T054; US2 extends it in T072). State machine: data-model.md § Take.
 */
import { and, desc, eq, like, ne, sql } from 'drizzle-orm';

import {
  feedbackReport,
  practiceItem,
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
import { touchItem } from './practiceItemsRepo';
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
  const saved = requireTake(db, id);
  if (saved.practiceItemId) touchItem(db, saved.practiceItemId);
  return saved;
}

/** Rename a take (title "≤ 80 chars"; empty clears it). */
export function updateTitle(db: Db, id: string, title: string | null): void {
  const clean = title?.trim() || null;
  if (clean && clean.length > 80) throw new Error('Titles can be at most 80 characters');
  db.update(take).set({ title: clean, updatedAt: nowIso() }).where(eq(take.id, id)).run();
}

export function setPracticeItem(db: Db, id: string, practiceItemId: string | null): void {
  db.update(take).set({ practiceItemId, updatedAt: nowIso() }).where(eq(take.id, id)).run();
  if (practiceItemId && requireTake(db, id).saved) touchItem(db, practiceItemId);
}

/** Delete a take's row; its report and points cascade. Files are the caller's job (takeService). */
export function deleteTakeRow(db: Db, id: string): void {
  db.delete(take).where(eq(take.id, id)).run();
}

export interface LibraryRow {
  id: string;
  recordedAt: string;
  durationMs: number;
  title: string | null;
  label: string | null;
  practiceItemId: string | null;
  analysisStatus: AnalysisStatus;
  summary: string | null;
  timingScore: number | null;
  techniqueScore: number | null;
  thumbPath: string;
  fileSizeBytes: number;
}

const libraryColumns = {
  id: take.id,
  recordedAt: take.recordedAt,
  durationMs: take.durationMs,
  title: take.title,
  label: practiceItem.name,
  practiceItemId: take.practiceItemId,
  analysisStatus: take.analysisStatus,
  summary: feedbackReport.summary,
  timingScore: feedbackReport.timingScore,
  techniqueScore: feedbackReport.techniqueScore,
  fileSizeBytes: take.fileSizeBytes,
};

/** Saved takes, newest first, optionally filtered by label (case-insensitive substring). */
export function libraryQuery(db: Db, { search }: { search?: string } = {}) {
  const term = search?.trim().toLowerCase();
  return db
    .select(libraryColumns)
    .from(take)
    .leftJoin(practiceItem, eq(take.practiceItemId, practiceItem.id))
    .leftJoin(feedbackReport, eq(feedbackReport.takeId, take.id))
    .where(term ? and(eq(take.saved, true), like(sql`lower(${practiceItem.name})`, `%${term}%`)) : eq(take.saved, true))
    .orderBy(desc(take.recordedAt));
}

export function withThumb<T extends { id: string }>(rows: T[]): (T & { thumbPath: string })[] {
  return rows.map((r) => ({ ...r, thumbPath: relTakePaths(r.id).thumb }));
}

export function listLibrary(db: Db, opts: { search?: string } = {}): LibraryRow[] {
  return withThumb(libraryQuery(db, opts).all());
}

/** Unsaved drafts are kept for this long, then removed at start-up (data-model.md § Draft cleanup). */
export const DRAFT_TTL_MS = 24 * 60 * 60 * 1000;

export interface DraftRow extends LibraryRow {
  /** When start-up cleanup will remove it (createdAt + 24 h). */
  removeAt: string;
}

/** "Not saved yet": unsaved, uninterrupted takes, newest first (FR-015, Story 2 scenario 5). */
export function draftsQuery(db: Db) {
  return db
    .select({ ...libraryColumns, createdAt: take.createdAt })
    .from(take)
    .leftJoin(practiceItem, eq(take.practiceItemId, practiceItem.id))
    .leftJoin(feedbackReport, eq(feedbackReport.takeId, take.id))
    .where(and(eq(take.saved, false), eq(take.interrupted, false), ne(take.captureStatus, 'recording')))
    .orderBy(desc(take.recordedAt));
}

export function toDraftRows(rows: ReturnType<ReturnType<typeof draftsQuery>['all']>): DraftRow[] {
  return withThumb(rows).map(({ createdAt, ...r }) => ({
    ...r,
    removeAt: new Date(Date.parse(createdAt) + DRAFT_TTL_MS).toISOString(),
  }));
}

export function listDrafts(db: Db): DraftRow[] {
  return toDraftRows(draftsQuery(db).all());
}

/**
 * Start-up recovery (tasks.md T077, research.md R13) — the single owner of status repair at launch.
 * Runs after migrations and before the analysis queue loads pending takes.
 *
 * 1. Takes still marked "recording" (the app died mid-take): probe the file. Readable → interrupted
 *    take with its real length. Unreadable (e.g. an MP4 left without its index by a crash or power
 *    loss) → delete it and report it as lost.
 * 2. Analyses that were running → pending (the queue picks them up again).
 * 3. Unsaved, uninterrupted drafts older than 24 h → deleted with their folders.
 * Saved takes are never touched.
 */
import { and, eq, lt } from 'drizzle-orm';

import { take } from '@/data/db/schema';
import type { Db } from '@/data/db/types';
import type { TakeFiles } from '@/data/files/takeFiles';
import { deleteTakeRow, DRAFT_TTL_MS, markInterrupted } from '@/data/repositories/takesRepo';
import { nowIso } from '@/lib/time';

export interface ProbeResult {
  ok: boolean;
  durationMs?: number;
}

export interface RecoveryDeps {
  db: Db;
  files: TakeFiles;
  /** Can this video be read, and how long is it? (decodes its audio track) */
  probe: (videoUri: string) => Promise<ProbeResult>;
  now?: () => number;
}

export interface RecoveryResult {
  /** Interrupted takes not yet saved: offered on /recover. */
  interruptedDraftIds: string[];
  /** Recordings that couldn't be recovered. */
  lostCount: number;
  deletedDrafts: number;
  requeued: number;
}

export async function runRecovery({ db, files, probe, now = Date.now }: RecoveryDeps): Promise<RecoveryResult> {
  let lostCount = 0;

  // 1. Crashed recordings.
  const crashed = db.select().from(take).where(eq(take.captureStatus, 'recording')).all();
  for (const row of crashed) {
    let result: ProbeResult;
    try {
      result = await probe(files.toAbsolute(row.videoPath));
    } catch {
      result = { ok: false };
    }
    if (result.ok) {
      markInterrupted(db, row.id, {
        durationMs: result.durationMs ?? row.durationMs,
        fileSizeBytes: files.takeDirSizeBytes(row.id),
      });
    } else {
      deleteTakeRow(db, row.id);
      files.deleteTakeDir(row.id);
      lostCount++;
    }
  }

  // 2. Analyses interrupted by the app closing.
  const running = db.select({ id: take.id }).from(take).where(eq(take.analysisStatus, 'analysing')).all();
  if (running.length > 0) {
    db.update(take).set({ analysisStatus: 'pending', updatedAt: nowIso() }).where(eq(take.analysisStatus, 'analysing')).run();
  }

  // 3. Expired drafts.
  const cutoff = new Date(now() - DRAFT_TTL_MS).toISOString();
  const expired = db
    .select({ id: take.id })
    .from(take)
    .where(and(eq(take.saved, false), eq(take.interrupted, false), lt(take.createdAt, cutoff)))
    .all();
  for (const { id } of expired) {
    deleteTakeRow(db, id);
    files.deleteTakeDir(id);
  }

  const interruptedDraftIds = db
    .select({ id: take.id })
    .from(take)
    .where(and(eq(take.saved, false), eq(take.interrupted, true)))
    .all()
    .map((r) => r.id);

  return { interruptedDraftIds, lostCount, deletedDrafts: expired.length, requeued: running.length };
}

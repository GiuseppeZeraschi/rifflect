/**
 * Recording controller (tasks.md T058). Owns one take's capture from start to finish:
 *
 *   idle → starting → recording → stopping → idle
 *
 * - start: check free space, create the take row and folder, start the recorder on the take's
 *   video path (auto-stops at 5:00), and remember the accompaniment setting.
 * - stop: finalise the video, then completeCapture and enqueue analysis unless it's too short.
 * - interrupt (app backgrounded, recorder error): the take is kept as an interrupted take
 *   (markInterrupted) and still analysed when long enough; the user can discard it afterwards.
 *
 * Native pieces (VisionCamera's Recorder, the landmark writer) are injected, so this is testable
 * in Node.
 */
import type { AccompanimentSetting, AnalysisStatus, CameraPosition } from '@/data/db/schema';
import type { Db } from '@/data/db/types';
import { storageStatus } from '@/data/files/storage';
import type { TakeFiles } from '@/data/files/takeFiles';
import { completeCapture, createTake, deleteTakeRow, markInterrupted } from '@/data/repositories/takesRepo';
import { MAX_RECORDING_MS, uriToPath } from './config';

/** The bit of VisionCamera's Recorder the controller needs. */
export interface RecorderHandle {
  start(onFinished: () => void, onError: (error: Error) => void): Promise<void>;
  stop(): Promise<void>;
}

/** Receives hand-landmark results during the take (native writer; added with the hand landmarker). */
export interface LandmarkSink {
  /** Relative path of the landmarks file, stored on the take. */
  relPath: string;
  close(): void;
}

export interface RecordingDeps {
  db: Db;
  files: TakeFiles;
  createRecorder(filePath: string, maxDurationSec: number): Promise<RecorderHandle>;
  enqueue(takeId: string): void;
  rememberAccompaniment(setting: AccompanimentSetting): void;
  openLandmarkSink?: (takeId: string) => LandmarkSink | null;
  now?: () => number;
}

export interface StartOptions {
  cameraPosition: CameraPosition;
  accompanimentSetting: AccompanimentSetting;
  targetTempoBpm: number | null;
}

export interface FinishedTake {
  takeId: string;
  durationMs: number;
  analysisStatus: AnalysisStatus;
  interrupted: boolean;
  /** Stopped automatically at the 5-minute limit. */
  reachedLimit: boolean;
}

export type RecordingState = 'idle' | 'starting' | 'recording' | 'stopping';

export interface RecordingSnapshot {
  state: RecordingState;
  takeId: string | null;
  /** Epoch ms when recording actually started (for the elapsed timer). */
  startedAt: number | null;
  /** The most recent finished take, until the next start. */
  lastFinished: FinishedTake | null;
}

export class StorageFullError extends Error {
  constructor() {
    super('Not enough free space to record a take');
    this.name = 'StorageFullError';
  }
}

interface Current {
  takeId: string;
  recorder: RecorderHandle | null;
  startedAt: number;
  interrupted: boolean;
  stopRequested: boolean;
  landmarks: LandmarkSink | null;
  settled: boolean;
  waiters: ((t: FinishedTake) => void)[];
}

export function createRecordingController(deps: RecordingDeps) {
  const now = deps.now ?? Date.now;
  let snapshot: RecordingSnapshot = { state: 'idle', takeId: null, startedAt: null, lastFinished: null };
  let current: Current | null = null;
  const listeners = new Set<(s: RecordingSnapshot) => void>();

  const set = (patch: Partial<RecordingSnapshot>) => {
    snapshot = { ...snapshot, ...patch };
    listeners.forEach((l) => l(snapshot));
  };

  function settle(c: Current, ok: boolean) {
    if (c.settled) return;
    c.settled = true;
    const elapsed = now() - c.startedAt;
    const durationMs = Math.min(elapsed, MAX_RECORDING_MS);
    const reachedLimit = ok && !c.stopRequested && elapsed >= MAX_RECORDING_MS - 1_000;
    let landmarksPath: string | null = null;
    if (c.landmarks) {
      try {
        c.landmarks.close();
        landmarksPath = c.landmarks.relPath;
      } catch {
        landmarksPath = null; // analysed from sound only (or extracted from the video later)
      }
    }
    const fileSizeBytes = deps.files.takeDirSizeBytes(c.takeId);
    const interrupted = c.interrupted || !ok;
    const row = interrupted
      ? markInterrupted(deps.db, c.takeId, { durationMs, fileSizeBytes })
      : completeCapture(deps.db, c.takeId, { durationMs, fileSizeBytes, landmarksPath });
    if (row.analysisStatus === 'pending') deps.enqueue(c.takeId);

    const finished: FinishedTake = { takeId: c.takeId, durationMs: row.durationMs, analysisStatus: row.analysisStatus, interrupted, reachedLimit };
    current = null;
    set({ state: 'idle', takeId: null, startedAt: null, lastFinished: finished });
    c.waiters.forEach((w) => w(finished));
  }

  async function requestStop(c: Current): Promise<FinishedTake> {
    const done = new Promise<FinishedTake>((resolve) => c.waiters.push(resolve));
    if (!c.stopRequested) {
      c.stopRequested = true;
      set({ state: 'stopping' });
      try {
        await c.recorder?.stop();
      } catch {
        settle(c, false); // already stopped or failed: keep what was recorded
      }
    }
    return done;
  }

  return {
    getSnapshot: () => snapshot,
    subscribe(listener: (s: RecordingSnapshot) => void): () => void {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    /** Start a take. Resolves with its id once the recorder is running. */
    async start(opts: StartOptions): Promise<string> {
      if (snapshot.state !== 'idle') throw new Error(`Can't start recording while ${snapshot.state}`);
      if (storageStatus(deps.db, deps.files).cannotRecord) throw new StorageFullError();
      set({ state: 'starting', lastFinished: null });

      let takeId: string | null = null;
      try {
        deps.rememberAccompaniment(opts.accompanimentSetting);
        const row = createTake(deps.db, opts);
        takeId = row.id;
        deps.files.ensureTakeDir(row.id);
        const c: Current = {
          takeId: row.id,
          recorder: null,
          startedAt: now(),
          interrupted: false,
          stopRequested: false,
          landmarks: deps.openLandmarkSink?.(row.id) ?? null,
          settled: false,
          waiters: [],
        };
        current = c;
        const recorder = await deps.createRecorder(uriToPath(deps.files.toAbsolute(row.videoPath)), MAX_RECORDING_MS / 1000);
        c.recorder = recorder;
        await recorder.start(
          () => settle(c, true),
          () => settle(c, false),
        );
        c.startedAt = now();
        if (!c.settled) set({ state: 'recording', takeId: row.id, startedAt: c.startedAt });
        return row.id;
      } catch (e) {
        // Nothing was recorded: remove the empty take.
        if (current && !current.settled) {
          try {
            current.landmarks?.close();
          } catch {
            // ignore
          }
        }
        current = null;
        if (takeId) {
          deleteTakeRow(deps.db, takeId);
          deps.files.deleteTakeDir(takeId);
        }
        set({ state: 'idle', takeId: null, startedAt: null });
        throw e;
      }
    },

    /** Stop the take normally. Resolves once the video is finalised and the take updated. */
    async stop(): Promise<FinishedTake | null> {
      return current ? requestStop(current) : null;
    },

    /** Stop because recording can't continue (app backgrounded, call); the take is kept. */
    async interrupt(): Promise<FinishedTake | null> {
      if (!current) return null;
      current.interrupted = true;
      return requestStop(current);
    },
  };
}

export type RecordingController = ReturnType<typeof createRecordingController>;

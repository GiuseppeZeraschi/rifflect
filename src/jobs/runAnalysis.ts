/**
 * The analysis runner the job queue calls for each take (tasks.md T060):
 *   take + profile snapshot → decode audio → load PCM → landmarks → analyseTake → save report.
 * Dependencies are injected so the whole flow runs in Node tests with fakes for the native parts.
 * Errors propagate to the queue, which marks the take `failed` (retry allowed).
 */
import {
  analyseTake,
  type AnalysisInput,
  type AnalysisResult,
  type LandmarkFrame,
} from '@/analysis';
import { AUDIO, LANDMARKS } from '@/analysis/config/thresholds';
import type { Db } from '@/data/db/types';
import type { TakeFiles } from '@/data/files/takeFiles';
import { saveReport } from '@/data/repositories/reportsRepo';
import { getTake, setLandmarksPath } from '@/data/repositories/takesRepo';
import type { DecodeResult } from '@/native/audioDecoder';
import { BEATS_PER_BAR } from '@/lib/meter';
import { loadPcm } from '@/native/pcm';
import type { Runner } from './analysisQueue';

export interface RunnerDeps {
  db: Db;
  files: TakeFiles;
  decodeAudioTrack(
    videoUri: string,
    pcmUri: string,
    opts: { sampleRate: 22050; mono: true },
  ): Promise<DecodeResult>;
  readPcmChunk(pcmUri: string, offsetFrames: number, frames: number): Float32Array;
  readLandmarks(uri: string): Promise<LandmarkFrame[]>;
  /** Hand tracking after the take (research R3, tasks.md T021): returns the landmarks file's relative path. */
  extractLandmarksFromVideo?(
    takeId: string,
    videoUri: string,
    fps: number,
    onProgress: (fraction: number) => void,
  ): Promise<string>;
  analyse?: (
    input: AnalysisInput,
    opts: { onProgress: (p: number) => void; signal: AbortSignal },
  ) => Promise<AnalysisResult>;
  now?: () => number;
  /** Development only: keep the decoded audio in the cache for inspection. */
  keepPcm?: boolean;
}

/**
 * Progress bar: decoding and loading the audio take the first 25%; hand tracking after the take (when
 * it runs) the next 40%, as it processes the whole video; the engine the rest.
 */
const DECODE_SHARE = 0.25;
const LANDMARK_SHARE = 0.4;

export function createRunner(deps: RunnerDeps): Runner {
  const analyse = deps.analyse ?? ((input, opts) => analyseTake(input, opts));
  const now = deps.now ?? Date.now;

  return async (takeId, onProgress, signal) => {
    const take = getTake(deps.db, takeId);
    if (!take) throw new Error(`Take ${takeId} not found`);
    const started = now();
    const pcmUri = deps.files.pcmCacheUri(takeId);
    const videoUri = deps.files.toAbsolute(take.videoPath);
    try {
      deps.files.ensurePcmCacheDir();
      const decoded = await deps.decodeAudioTrack(videoUri, pcmUri, {
        sampleRate: AUDIO.sampleRate,
        mono: true,
      });
      onProgress(DECODE_SHARE * 0.6);
      const samples = await loadPcm(decoded.pcmPath, {
        totalFrames: decoded.frames,
        readChunk: deps.readPcmChunk,
        onProgress: (p) => onProgress(DECODE_SHARE * (0.6 + 0.4 * p)),
        signal,
      });

      let landmarks: LandmarkFrame[] | null = null;
      let engineFrom = DECODE_SHARE;
      if (take.landmarksPath) {
        landmarks = await deps.readLandmarks(deps.files.toAbsolute(take.landmarksPath));
      } else if (deps.extractLandmarksFromVideo) {
        try {
          const rel = await deps.extractLandmarksFromVideo(takeId, videoUri, LANDMARKS.fps, (p) =>
            onProgress(DECODE_SHARE + LANDMARK_SHARE * p),
          );
          // Keep them: re-analysis (e.g. a different accompaniment setting) needn't track again.
          setLandmarksPath(deps.db, takeId, rel);
          landmarks = await deps.readLandmarks(deps.files.toAbsolute(rel));
        } catch {
          landmarks = null; // analysed from sound only, with a landmarks_missing limitation
        }
        engineFrom = DECODE_SHARE + LANDMARK_SHARE;
      }
      if (landmarks && landmarks.length === 0) landmarks = null;

      const result = await analyse(
        {
          audio: { sampleRate: AUDIO.sampleRate, samples },
          landmarks,
          durationMs: take.durationMs,
          player: {
            handedness: take.handednessAtRecording,
            skillLevel: take.skillLevelAtRecording,
          },
          cameraPosition: take.cameraPosition,
          ...(take.targetTempoBpm != null ? { targetTempoBpm: take.targetTempoBpm } : {}),
          beatsPerBar: BEATS_PER_BAR[take.timeSignature],
          ...(take.metronomeBpm != null ? { metronomeBpm: take.metronomeBpm } : {}),
          accompaniment: take.accompanimentSetting,
          // Front-camera takes are recorded mirrored (selfie view), so their landmarks are too.
          landmarksMirrored: take.cameraPosition === 'front',
          interrupted: take.interrupted,
        },
        { onProgress: (p) => onProgress(engineFrom + (1 - engineFrom) * p), signal },
      );
      if (signal.aborted) throw new Error('Analysis cancelled');
      saveReport(deps.db, takeId, result, now() - started);
      return result.status;
    } finally {
      if (!deps.keepPcm)
        try {
          deps.files.deletePcmCache(takeId);
        } catch {
          // cache cleanup must never hide the real outcome
        }
    }
  };
}

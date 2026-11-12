import { createTakeFiles } from '@/data/files/takeFiles';
import { getReportWithPoints } from '@/data/repositories/reportsRepo';
import { completeCapture, createTake, getTake } from '@/data/repositories/takesRepo';
import { upsertProfile } from '@/data/repositories/profileRepo';
import { createAnalysisQueue } from '@/jobs/analysisQueue';
import { createRunner, type RunnerDeps } from '@/jobs/runAnalysis';
import { parseLandmarksJsonl } from '@/native/landmarksParse';
import { MemoryFileStore } from '../../helpers/memoryFileStore';
import { onsetTrain, speechLike } from '../../helpers/synth';
import { landmarkStream, strummingHand } from '../../helpers/synthLandmarks';
import { createTestDb } from '../../helpers/testDb';

const train = onsetTrain({ bpm: 100, beats: 40, beatOffset: { beat: 4, beatsPerBar: 4, offsetMs: -45 }, seed: 41 });
const trainMs = Math.round(train.samples.length / 22.05);

function setup(audio: Float32Array, landmarksJsonl: string | null) {
  const t = createTestDb();
  const store = new MemoryFileStore();
  const files = createTakeFiles(store);
  upsertProfile(t.db, { handedness: 'right', skillLevel: 'intermediate' });
  const tk = createTake(t.db, { cameraPosition: 'front', accompanimentSetting: 'off' });
  completeCapture(t.db, tk.id, {
    durationMs: Math.round(audio.length / 22.05),
    fileSizeBytes: 1,
    landmarksPath: landmarksJsonl ? files.relLandmarksPath(tk.id) : null,
  });
  const pcm = new Map<string, Float32Array>();
  const calls: string[] = [];
  const deps: RunnerDeps = {
    db: t.db,
    files,
    decodeAudioTrack: async (videoUri, pcmUri) => {
      calls.push(`decode ${videoUri.endsWith(`takes/${tk.id}/video.mp4`)}`);
      pcm.set(pcmUri, audio);
      store.addFile(pcmUri, audio.length * 4);
      return { pcmPath: pcmUri, sampleRate: 22050, frames: audio.length, durationMs: audio.length / 22.05, peak: 1 };
    },
    readPcmChunk: (uri, off, n) => pcm.get(uri)!.slice(off, off + n),
    readLandmarks: async () => (landmarksJsonl ? parseLandmarksJsonl(landmarksJsonl).frames : []),
    now: (() => {
      let n = 0;
      return () => (n += 750);
    })(),
  };
  return { t, store, files, tk, deps, calls };
}

const toJsonl = (frames: ReturnType<typeof landmarkStream>) =>
  frames.map((f) => JSON.stringify({ t: f.tMs, hands: f.hands, b: f.brightness })).join('\n');

describe('analysis runner', () => {
  it('decodes, analyses with landmarks, saves the report and removes the PCM cache', async () => {
    const jsonl = toJsonl(landmarkStream({ durationMs: trainMs, picking: strummingHand(train.onsetsMs) }));
    const { t, store, files, tk, deps, calls } = setup(train.samples, jsonl);
    const progress: number[] = [];
    const status = await createRunner(deps)(tk.id, (p) => progress.push(p), new AbortController().signal);

    expect(status).toBe('analysed');
    expect(calls).toEqual(['decode true']);
    const saved = getReportWithPoints(t.db, tk.id)!;
    expect(saved.report.processingMs).toBe(750);
    expect(saved.points.map((p) => p.issueCode)).toContain('timing.rushing');
    expect(saved.report.analysedCoverage.frettingHand).toBeGreaterThan(0.9);
    expect(store.exists(files.pcmCacheUri(tk.id))).toBe(false);
    expect(progress[progress.length - 1]).toBe(1);
    expect([...progress].sort((a, b) => a - b)).toEqual(progress);
    t.close();
  });

  it('analyses from sound only when there is no landmark stream', async () => {
    const { t, tk, deps } = setup(train.samples, null);
    await createRunner(deps)(tk.id, () => {}, new AbortController().signal);
    const saved = getReportWithPoints(t.db, tk.id)!;
    expect(saved.report.limitations.map((l) => l.code)).toContain('landmarks_missing');
    t.close();
  });

  it('returns no_playing for talking only', async () => {
    const { t, tk, deps } = setup(speechLike(8000), null);
    expect(await createRunner(deps)(tk.id, () => {}, new AbortController().signal)).toBe('no_playing');
    expect(getReportWithPoints(t.db, tk.id)!.points).toEqual([]);
    t.close();
  });

  it('marks the take failed through the queue when decoding fails, and still cleans up', async () => {
    const { t, store, files, tk, deps } = setup(train.samples, null);
    deps.decodeAudioTrack = async (_v, pcmUri) => {
      store.addFile(pcmUri, 10);
      throw Object.assign(new Error('E_DECODE_FAILED'), { code: 'E_DECODE_FAILED' });
    };
    const q = createAnalysisQueue({ db: t.db, runner: createRunner(deps) });
    q.enqueue(tk.id);
    await q.idle();
    expect(getTake(t.db, tk.id)!.analysisStatus).toBe('failed');
    expect(q.lastError(tk.id)).toMatch(/E_DECODE_FAILED/);
    expect(store.exists(files.pcmCacheUri(tk.id))).toBe(false);
    t.close();
  });
});

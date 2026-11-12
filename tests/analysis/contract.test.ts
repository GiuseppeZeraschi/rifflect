/**
 * Contract guarantees 1–7 (contracts/analysis-engine.md, tasks.md T038).
 */
import { analyseTake, type AnalysisInput, type SkillLevel } from '@/analysis';
import { CONFIDENCE_FLOOR } from '@/analysis/config/thresholds';
import { renderText } from '@/analysis/feedback-text/render';
import { onsetTrain, silence, speechLike } from '../helpers/synth';
import { DEFAULT_FRETTING, landmarkStream, strummingHand } from '../helpers/synthLandmarks';

function input(samples: Float32Array, over: Partial<AnalysisInput> = {}): AnalysisInput {
  const durationMs = Math.round((samples.length / 22050) * 1000);
  return {
    audio: { sampleRate: 22050, samples },
    landmarks: null,
    durationMs,
    player: { handedness: 'right', skillLevel: 'intermediate' },
    cameraPosition: 'front',
    accompaniment: 'off',
    ...over,
  };
}

const train = onsetTrain({ bpm: 100, beats: 32, beatOffset: { beat: 4, beatsPerBar: 4, offsetMs: -45 }, seed: 31 });
const takeMs = Math.round((train.samples.length / 22050) * 1000);
const withHands = (skill: SkillLevel = 'intermediate') =>
  input(train.samples, {
    landmarks: landmarkStream({ durationMs: takeMs, fretting: () => ({ ...DEFAULT_FRETTING, pipDeg: 170 }), picking: strummingHand(train.onsetsMs) }),
    player: { handedness: 'right', skillLevel: skill },
  });

describe('guarantee 1: no playing → no findings', () => {
  it.each([
    ['silence', silence(10_000)],
    ['speech-like audio', speechLike(10_000)],
  ])('%s gives no_playing with no points and null scores', async (_, samples) => {
    const r = await analyseTake(input(samples));
    expect(r.status).toBe('no_playing');
    expect(r.points).toEqual([]);
    expect(r.timingScore).toBeNull();
    expect(r.techniqueScore).toBeNull();
  });
});

describe('guarantees 2–7 on an analysed take', () => {
  let result: Awaited<ReturnType<typeof analyseTake>>;
  beforeAll(async () => {
    result = await analyseTake(withHands());
  });

  it('2: has at least one timing and one technique point', () => {
    expect(result.status).toBe('analysed');
    expect(result.points.some((p) => p.category === 'timing')).toBe(true);
    expect(result.points.some((p) => p.category === 'technique')).toBe(true);
    expect(result.timingScore).not.toBeNull();
    expect(result.techniqueScore).not.toBeNull();
  });

  it('2: without a detectable tempo, timing has a limitation and a null score instead', async () => {
    const few = onsetTrain({ bpm: 60, beats: 5, seed: 4 });
    const r = await analyseTake(input(few.samples));
    if (r.status === 'analysed' && !r.points.some((p) => p.category === 'timing')) {
      expect(r.timingScore).toBeNull();
      expect(r.limitations.map((l) => l.code)).toContain('tempo_not_detected');
    }
  });

  it('3: every startMs is within the take', () => {
    for (const p of result.points) {
      expect(p.startMs).toBeGreaterThanOrEqual(0);
      expect(p.startMs).toBeLessThanOrEqual(withHands().durationMs);
    }
  });

  it('3: the expected findings are present', () => {
    const codes = result.points.map((p) => p.issueCode);
    expect(codes).toContain('timing.rushing');
    expect(codes).toContain('technique.flat_fingers');
  });

  it('4: the same input always gives the same output', async () => {
    const again = await analyseTake(withHands());
    expect(again).toEqual(result);
  });

  it('6: text depends only on issue code, metrics and skill level', async () => {
    for (const p of result.points) {
      expect(renderText(p.issueCode, p.metrics, 'intermediate')).toEqual({ observation: p.observation, suggestion: p.suggestion });
    }
    const beginner = await analyseTake(withHands('beginner'));
    const rushB = beginner.points.find((p) => p.issueCode === 'timing.rushing')!;
    const rushI = result.points.find((p) => p.issueCode === 'timing.rushing')!;
    expect(rushB.observation).not.toBe(rushI.observation);
  });

  it('no point is below the confidence floor', () => {
    for (const p of result.points) expect(p.confidence).toBeGreaterThanOrEqual(CONFIDENCE_FLOOR);
  });

  it('the summary is at most 140 characters', () => {
    expect(result.summary.length).toBeGreaterThan(0);
    expect(result.summary.length).toBeLessThanOrEqual(140);
  });

  it('points are sorted by severity, then time', () => {
    const order = { major: 0, moderate: 1, minor: 2, info: 3 };
    for (let i = 1; i < result.points.length; i++) {
      const a = result.points[i - 1]!;
      const b = result.points[i]!;
      expect(order[a.severity] < order[b.severity] || (order[a.severity] === order[b.severity] && a.startMs <= b.startMs)).toBe(true);
    }
  });
});

describe('guarantee 4: tempo reference', () => {
  it('reports the target delta and an off-target point when a target is set', async () => {
    const t = onsetTrain({ bpm: 86, beats: 30, seed: 10 });
    const r = await analyseTake(input(t.samples, { targetTempoBpm: 80 }));
    expect(r.tempo.targetDeltaBpm!).toBeCloseTo(6, 0);
    expect(r.points.map((p) => p.issueCode)).toContain('timing.off_target_tempo');
  });
});

describe('progress and cancellation', () => {
  it('reports increasing progress ending at 1', async () => {
    const seen: number[] = [];
    await analyseTake(input(train.samples), { onProgress: (p) => seen.push(p) });
    expect(seen[0]).toBe(0);
    expect(seen[seen.length - 1]).toBe(1);
    expect([...seen].sort((a, b) => a - b)).toEqual(seen);
  });

  it('stops when the signal is aborted', async () => {
    const c = new AbortController();
    c.abort();
    await expect(analyseTake(input(train.samples), { signal: c.signal })).rejects.toThrow('cancelled');
  });

  it('adds a take_interrupted limitation for interrupted takes', async () => {
    const r = await analyseTake(input(train.samples, { interrupted: true }));
    expect(r.limitations.map((l) => l.code)).toContain('take_interrupted');
  });
});

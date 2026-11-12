/** Separation and attribution over a loop (tasks.md T081, SC-009). */
import { analyseTake, type AnalysisInput } from '@/analysis';
import { analyseAccompanied } from '@/analysis/accompaniment';
import { detectAccompaniment } from '@/analysis/accompaniment/detect';
import { assignHands } from '@/analysis/technique/hands';
import { detectOnsets } from '@/analysis/timing/onsets';
import { landmarkStream } from '../../helpers/synthLandmarks';
import { leadOverLoop, type Mix } from '../../helpers/synthMix';

function run(mix: Mix, withHands = true) {
  const detection = detectAccompaniment(mix.samples);
  const tracks = withHands ? assignHands(mix.landmarks, { handedness: 'right', mirrored: false }) : null;
  return analyseAccompanied({ samples: mix.samples, mixOnsets: detectOnsets(mix.samples), detection, kind: 'loop', tracks });
}

const within = (a: number[], t: number, ms: number) => a.some((x) => Math.abs(x - t) <= ms);

function input(mix: Mix, over: Partial<AnalysisInput> = {}): AnalysisInput {
  return {
    audio: { sampleRate: 22050, samples: mix.samples },
    landmarks: mix.landmarks,
    durationMs: mix.durationMs,
    player: { handedness: 'right', skillLevel: 'intermediate' },
    cameraPosition: 'front',
    accompaniment: 'auto',
    ...over,
  };
}

describe('live onsets over a loop at 1× gain', () => {
  const mix = leadOverLoop({ gain: 1, seed: 11 });
  const r = run(mix);

  it('finds ≥ 90% of the lead’s notes', () => {
    const hits = mix.leadOnsetsMs.filter((t) => within(r.liveOnsetsMs, t, 30)).length;
    expect(hits / mix.leadOnsetsMs.length).toBeGreaterThanOrEqual(0.9);
  });

  it('lets through ≤ 10% of the loop’s notes', () => {
    const loopOnly = mix.accOnsetsMs.filter((t) => !within(mix.leadOnsetsMs, t, 60));
    const leaked = loopOnly.filter((t) => within(r.liveOnsetsMs, t, 20)).length;
    expect(leaked / loopOnly.length).toBeLessThanOrEqual(0.1);
  });

  it('measures timing against the loop', () => {
    expect(r.accompaniment).toMatchObject({ kind: 'loop', timingReference: 'accompaniment' });
    expect(Math.abs(r.accompaniment.loopLengthMs! - mix.loopMs)).toBeLessThanOrEqual(10);
    expect(r.tempo.bpm!).toBeCloseTo(100, 0);
  });
});

describe('a buzz in the loop is not blamed on the player', () => {
  it('reports no fret buzz when only the loop buzzes', async () => {
    const mix = leadOverLoop({ gain: 1, buzzInLoop: true, seed: 12 });
    const result = await analyseTake(input(mix));
    expect(result.accompaniment.kind).toBe('loop');
    expect(result.points.map((p) => p.issueCode)).not.toContain('technique.fret_buzz');
  });
});

describe('separation confidence', () => {
  it('is good with a quiet loop (0.5×)', () => {
    expect(run(leadOverLoop({ gain: 0.5, seed: 13 })).accompaniment.separationConfidence).toBe('good');
  });

  it('is at most partial with a loud loop (2×)', () => {
    expect(['partial', 'poor']).toContain(run(leadOverLoop({ gain: 2, seed: 14 })).accompaniment.separationConfidence);
  });

  it('is poor with a very loud loop (4×) and no hand tracking', () => {
    const mix = leadOverLoop({ gain: 4, seed: 15 });
    expect(run({ ...mix, landmarks: landmarkStream({ durationMs: 0 }) }, false).accompaniment.separationConfidence).toBe('poor');
  });
});

describe('unison', () => {
  it('reports the bars where the lead doubles the loop', () => {
    const mix = leadOverLoop({ gain: 1, unisonBars: [5, 7], seed: 16 });
    const r = run(mix);
    const lim = r.limitations.find((l) => l.code === 'unison_with_accompaniment');
    expect(lim).toBeDefined();
    const bar = mix.beatMs * 4;
    expect(lim!.fromMs!).toBeGreaterThanOrEqual(4 * bar - 1000);
    expect(lim!.toMs!).toBeLessThanOrEqual(7 * bar + 1500);
  });
});

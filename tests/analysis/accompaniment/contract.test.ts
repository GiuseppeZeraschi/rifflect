/** Accompaniment contract guarantees 8–11 and loop-only no-playing (tasks.md T082). */
import { analyseTake, type AnalysisInput } from '@/analysis';
import { DEFAULT_FRETTING, landmarkStream, strummingHand } from '../../helpers/synthLandmarks';
import { leadOverLoop, type Mix } from '../../helpers/synthMix';

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

const solo = leadOverLoop({ gain: 0, seed: 21 });
const looped = leadOverLoop({ gain: 1, seed: 22 });

describe('guarantee 8: the accompaniment setting', () => {
  it("'off' gives exactly the solo result, and 'auto' on a solo take gives the same", async () => {
    const off = await analyseTake(input(solo, { accompaniment: 'off' }));
    const auto = await analyseTake(input(solo, { accompaniment: 'auto' }));
    expect(off.accompaniment.kind).toBe('none');
    expect(auto).toEqual(off);
  });

  it("'off' on a take with a loop doesn't run the accompaniment stage", async () => {
    const r = await analyseTake(input(looped, { accompaniment: 'off' }));
    expect(r.accompaniment).toEqual({ kind: 'none', loopLengthMs: null, timingReference: 'own_playing', separationConfidence: null, liveOnsetMatchRate: null });
  });

  it("'on' with no repetition is treated as backing", async () => {
    const r = await analyseTake(input(solo, { accompaniment: 'on' }));
    expect(r.accompaniment.kind).toBe('backing');
  });
});

describe('guarantee 9: timing against the accompaniment, live notes only', () => {
  it('measures timing against the loop and reports only live notes', async () => {
    const r = await analyseTake(input(looped));
    expect(r.accompaniment).toMatchObject({ kind: 'loop', timingReference: 'accompaniment' });
    const timing = r.points.filter((p) => p.category === 'timing');
    expect(timing.length).toBeGreaterThan(0);
    for (const p of timing) {
      expect(looped.leadOnsetsMs.some((t) => Math.abs(t - p.startMs) <= 30)).toBe(true);
    }
  });

  it('points to the bars where the lead rushed (spec independent test)', async () => {
    const mix = leadOverLoop({ gain: 1, leadOffset: { fromBar: 5, toBar: 6, offsetMs: -45 }, seed: 23 });
    const r = await analyseTake(input(mix));
    const ahead = r.points.find((p) => p.issueCode === 'timing.ahead_of_accompaniment');
    expect(ahead).toBeDefined();
    expect(ahead!.metrics).toMatchObject({ barFrom: 5, barTo: 6 });
    expect(ahead!.observation).toContain('bars 5–6');
  });

  it('says the player is locked in when they are', async () => {
    const r = await analyseTake(input(looped));
    expect(r.points.map((p) => p.issueCode)).toContain('timing.locked_to_accompaniment');
    expect(r.timingScore).not.toBeNull();
  });

  it("doesn't report a change for a steady loop", async () => {
    const r = await analyseTake(input(looped));
    expect(r.limitations.map((l) => l.code)).not.toContain('accompaniment_changed');
  });
});

describe('guarantee 10: clarity only when separation is trustworthy', () => {
  it('drops clarity points and says so when separation is poor', async () => {
    const loud = leadOverLoop({ gain: 4, seed: 24 });
    const r = await analyseTake(input(loud, { landmarks: null }));
    expect(r.accompaniment.separationConfidence).toBe('poor');
    expect(r.points.some((p) => p.aspect === 'clarity')).toBe(false);
    expect(r.limitations.map((l) => l.code)).toContain('accompaniment_separation_low');
  });
});

describe('guarantee 11: hand tracking is unaffected by the mode', () => {
  it('gives the same fretting-hand findings with and without accompaniment handling', async () => {
    const base = leadOverLoop({ gain: 1, seed: 25 });
    const landmarks = landmarkStream({ durationMs: base.durationMs, fretting: () => ({ ...DEFAULT_FRETTING, pipDeg: 170 }), picking: strummingHand(base.leadOnsetsMs) });
    const hands = (r: Awaited<ReturnType<typeof analyseTake>>) => r.points.filter((p) => p.aspect === 'fretting_hand');
    const off = await analyseTake(input(base, { landmarks, accompaniment: 'off' }));
    const auto = await analyseTake(input(base, { landmarks, accompaniment: 'auto' }));
    expect(hands(off).length).toBeGreaterThan(0);
    expect(hands(auto)).toEqual(hands(off));
  });
});

describe('strumming pauses over a loop', () => {
  it("doesn't call the lead's rests a stopped strum just because the loop carries on", async () => {
    const r = await analyseTake(input(looped));
    expect(r.points.map((p) => p.issueCode)).not.toContain('technique.stopped_strum_motion');
  });
});

describe('guarantee 1 with accompaniment', () => {
  it('a loop playing on its own is no_playing', async () => {
    const r = await analyseTake(input(leadOverLoop({ loopOnly: true, seed: 26 })));
    expect(r.status).toBe('no_playing');
    expect(r.points).toEqual([]);
    expect(r.accompaniment.kind).toBe('loop');
  });
});

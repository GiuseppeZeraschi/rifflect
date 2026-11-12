/**
 * Technique engine tests (tasks.md T037) on synthetic hand landmarks and synthetic notes.
 */
import { analyseTechnique } from '@/analysis/technique';
import { assignHands } from '@/analysis/technique/hands';
import { analyseClarity } from '@/analysis/technique/clarity';
import type { Finding } from '@/analysis/types';
import { beatTimes, buzzBurst, mixAt, mutedNote, onsetTrain, pluck, silence } from '../helpers/synth';
import { DEFAULT_FRETTING, landmarkStream, strummingHand } from '../helpers/synthLandmarks';

const codes = (fs: Finding[]) => fs.map((f) => f.issueCode);
const DURATION = 20_000;
const strokes = beatTimes(100, 32, 500);

function technique(frames: ReturnType<typeof landmarkStream>, opts: Partial<Parameters<typeof analyseTechnique>[0]> = {}) {
  const { samples, onsetsMs } = onsetTrain({ bpm: 100, beats: 32, seed: 2 });
  return analyseTechnique({
    samples,
    onsetsMs,
    landmarks: frames,
    handedness: 'right',
    landmarksMirrored: false,
    durationMs: DURATION,
    ...opts,
  });
}

describe('fretting-hand rules', () => {
  it('flags the thumb wrapped over the neck for most of the take', () => {
    const frames = landmarkStream({ durationMs: DURATION, fretting: () => ({ ...DEFAULT_FRETTING, thumbTipDy: -0.35 }), picking: strummingHand(strokes) });
    expect(codes(technique(frames).findings)).toContain('technique.fret_thumb_over_neck');
  });

  it('flags flat fingers (straight PIP joints)', () => {
    const frames = landmarkStream({ durationMs: DURATION, fretting: () => ({ ...DEFAULT_FRETTING, pipDeg: 170 }), picking: strummingHand(strokes) });
    expect(codes(technique(frames).findings)).toContain('technique.flat_fingers');
  });

  it('flags fingers lifting high between notes', () => {
    const frames = landmarkStream({
      durationMs: DURATION,
      fretting: (t) => ({ ...DEFAULT_FRETTING, fingerLift: Math.floor(t / 600) % 2 === 0 ? 0 : 0.55 }),
      picking: strummingHand(strokes),
    });
    expect(codes(technique(frames).findings)).toContain('technique.fingers_lifting_high');
  });

  it('flags wrist strain only when the extreme angle is held for more than 5 s', () => {
    const held = landmarkStream({ durationMs: DURATION, fretting: (t) => ({ ...DEFAULT_FRETTING, rotationDeg: t > 4000 && t < 11000 ? 60 : 0 }), picking: strummingHand(strokes) });
    expect(codes(technique(held).findings)).toContain('technique.wrist_strain');
    const brief = landmarkStream({ durationMs: DURATION, fretting: (t) => ({ ...DEFAULT_FRETTING, rotationDeg: t > 4000 && t < 7000 ? 60 : 0 }), picking: strummingHand(strokes) });
    expect(codes(technique(brief).findings)).not.toContain('technique.wrist_strain');
  });

  it('reports nothing for a good fretting hand', () => {
    const frames = landmarkStream({ durationMs: DURATION, picking: strummingHand(strokes) });
    const fretting = technique(frames).findings.filter((f) => f.aspect === 'fretting_hand');
    expect(fretting).toEqual([]);
  });
});

describe('picking-hand rules', () => {
  it('flags inconsistent strum size', () => {
    const amplitudes = strokes.map((_, i) => (i % 3 === 0 ? 1 : 0.15));
    const frames = landmarkStream({ durationMs: DURATION, picking: strummingHand(strokes, { amplitudes }) });
    expect(codes(technique(frames).findings)).toContain('technique.inconsistent_strum');
  });

  it('flags the strumming hand stopping while notes continue', () => {
    const gapped = strokes.filter((t) => t < 7000 || t > 10500);
    const frames = landmarkStream({ durationMs: DURATION, picking: strummingHand(gapped) });
    expect(codes(technique(frames).findings)).toContain('technique.stopped_strum_motion');
  });

  it('reports nothing for a steady strum', () => {
    const frames = landmarkStream({ durationMs: DURATION, picking: strummingHand(strokes) });
    expect(technique(frames).findings.filter((f) => f.aspect === 'picking_hand')).toEqual([]);
  });
});

describe('clarity rules (audio)', () => {
  const times = beatTimes(80, 16, 500);
  function notes(kind: (i: number) => 'clean' | 'buzz' | 'muted') {
    const out = silence(times[times.length - 1]! + 1500);
    times.forEach((t, i) => {
      const k = kind(i);
      if (k === 'muted') mixAt(out, mutedNote(196, i + 1), t);
      else mixAt(out, pluck({ freq: 196 + (i % 4) * 30, seed: i + 1 }), t);
      if (k === 'buzz') mixAt(out, buzzBurst(120, 0.2, i + 7), t + 5);
    });
    return out;
  }

  it('flags fret buzz', () => {
    const r = analyseClarity(notes((i) => (i % 4 === 1 ? 'buzz' : 'clean')), times);
    expect(codes(r)).toContain('technique.fret_buzz');
  });

  it('flags muted (dead) notes', () => {
    const r = analyseClarity(notes((i) => (i % 3 === 0 ? 'muted' : 'clean')), times);
    expect(codes(r)).toContain('technique.muted_notes');
  });

  it('reports clean notes as clean', () => {
    expect(codes(analyseClarity(notes(() => 'clean'), times))).toEqual(['technique.clean']);
  });

  it('ignores onsets whose live confidence is too low (used with accompaniment)', () => {
    const audio = notes((i) => (i % 4 === 1 ? 'buzz' : 'clean'));
    const r = analyseClarity(audio, times, { liveConfidence: times.map((_, i) => (i % 4 === 1 ? 0.3 : 0.9)) });
    expect(codes(r)).not.toContain('technique.fret_buzz');
  });
});

describe('hand roles (contract guarantee 5)', () => {
  it('assigns roles for a right-handed player on un-mirrored frames (labels flipped)', () => {
    const frames = landmarkStream({ durationMs: 2000, handedness: 'right' });
    const tracks = assignHands(frames, { handedness: 'right', mirrored: false });
    expect(tracks.fretting[0]![0]![0]).toBeGreaterThan(0.5); // fretting hand on the image right
    expect(tracks.picking[0]![0]![0]).toBeLessThan(0.5);
  });

  it('assigns roles for a left-handed player on mirrored frames', () => {
    const frames = landmarkStream({ durationMs: 2000, handedness: 'left', mirrored: true });
    const tracks = assignHands(frames, { handedness: 'left', mirrored: true });
    // Left-handed: fretting hand is the true right hand. Mirrored frames put it on the image right.
    expect(tracks.fretting[0]![0]![0]).toBeGreaterThan(0.5);
    expect(tracks.picking[0]![0]![0]).toBeLessThan(0.5);
  });

  it('gives the same findings for left-handed players as for right-handed ones', () => {
    const pose = () => ({ ...DEFAULT_FRETTING, pipDeg: 170 });
    const left = landmarkStream({ durationMs: DURATION, handedness: 'left', fretting: pose, picking: strummingHand(strokes) });
    const r = technique(left, { handedness: 'left' });
    expect(codes(r.findings)).toContain('technique.flat_fingers');
  });
});

describe('coverage and limitations', () => {
  it('reports ~50% fretting coverage and a hands_not_visible range when hands vanish for half the take', () => {
    const frames = landmarkStream({ durationMs: DURATION, picking: strummingHand(strokes), missing: [[10_000, 20_000]] });
    const r = technique(frames);
    expect(r.coverage.frettingHand).toBeCloseTo(0.5, 1);
    const lim = r.limitations.find((l) => l.code === 'hands_not_visible');
    expect(lim).toBeDefined();
    expect(Math.abs(lim!.fromMs! - 10_000)).toBeLessThanOrEqual(100);
    expect(Math.abs(lim!.toMs! - 20_000)).toBeLessThanOrEqual(100);
  });

  it('reports landmarks_missing when there is no landmark stream', () => {
    const r = technique([] as never, { landmarks: null });
    expect(r.limitations.map((l) => l.code)).toContain('landmarks_missing');
    expect(r.coverage.frettingHand).toBe(0);
  });

  it('reports fretting_hand_out_of_frame when the hand drifts off the edge', () => {
    const frames = landmarkStream({
      durationMs: DURATION,
      fretting: (t) => ({ ...DEFAULT_FRETTING, wrist: [t > 8000 && t < 14000 ? 0.97 : 0.68, 0.62] }),
      picking: strummingHand(strokes),
    });
    expect(technique(frames).limitations.map((l) => l.code)).toContain('fretting_hand_out_of_frame');
  });
});

/**
 * Timing engine tests (tasks.md T036) on synthetic onset trains with known ground truth.
 */
import { analyseTiming } from '@/analysis/timing';
import { detectOnsets } from '@/analysis/timing/onsets';
import { addNoise, onsetTrain } from '../helpers/synth';

const codes = (r: ReturnType<typeof analyseTiming>) => r.findings.map((f) => f.issueCode);

describe('onset detection', () => {
  it('finds onsets within ±10 ms with recall ≥ 95% at 20 dB SNR', () => {
    const { samples, onsetsMs } = onsetTrain({ bpm: 120, beats: 40, jitterMs: 8, seed: 21 });
    const noisy = addNoise(samples, 20, 'white', 22);
    const { onsetsMs: found } = detectOnsets(noisy);
    let hits = 0;
    for (const truth of onsetsMs) {
      if (found.some((f) => Math.abs(f - truth) <= 10)) hits++;
    }
    expect(hits / onsetsMs.length).toBeGreaterThanOrEqual(0.95);
    expect(found.length).toBeLessThanOrEqual(onsetsMs.length * 1.1);
  });
});

describe('tempo estimation', () => {
  it.each([60, 90, 120, 160, 200])('estimates %i BPM within ±1 BPM', (bpm) => {
    const { samples } = onsetTrain({ bpm, beats: Math.round(bpm / 3), seed: bpm });
    const r = analyseTiming(samples, {});
    expect(r.tempo.bpm).not.toBeNull();
    expect(Math.abs(r.tempo.bpm! - bpm)).toBeLessThanOrEqual(1);
  });

  it('uses the target tempo to resolve half/double ambiguity', () => {
    const { samples } = onsetTrain({ bpm: 140, beats: 48, seed: 3 }); // eighth notes at 70 BPM
    expect(Math.abs(analyseTiming(samples, {}).tempo.bpm! - 140)).toBeLessThanOrEqual(1);
    expect(Math.abs(analyseTiming(samples, { targetTempoBpm: 70 }).tempo.bpm! - 70)).toBeLessThanOrEqual(1);
  });
});

describe('timing findings', () => {
  it('reports rushing on beat 4 for a constant −40 ms offset there', () => {
    const { samples } = onsetTrain({ bpm: 100, beats: 32, beatOffset: { beat: 4, beatsPerBar: 4, offsetMs: -40 }, seed: 5 });
    const r = analyseTiming(samples, {});
    const rush = r.findings.find((f) => f.issueCode === 'timing.rushing');
    expect(rush).toBeDefined();
    expect(rush!.metrics.beat).toBe(4);
    expect(codes(r)).not.toContain('timing.dragging');
  });

  it('reports dragging on beat 4 for a constant +40 ms offset there', () => {
    const { samples } = onsetTrain({ bpm: 100, beats: 32, beatOffset: { beat: 4, beatsPerBar: 4, offsetMs: 40 }, seed: 6 });
    const r = analyseTiming(samples, {});
    const drag = r.findings.find((f) => f.issueCode === 'timing.dragging');
    expect(drag?.metrics.beat).toBe(4);
    expect(codes(r)).not.toContain('timing.rushing');
  });

  it('reports drift up for a 6 BPM linear increase', () => {
    const { samples } = onsetTrain({ bpm: 90, beats: 40, driftBpm: 6, seed: 8 });
    const r = analyseTiming(samples, {});
    expect(codes(r)).toContain('timing.tempo_drift_up');
    expect(r.tempo.driftBpm!).toBeGreaterThan(3);
  });

  it('reports drift down for a 6 BPM linear decrease', () => {
    const { samples } = onsetTrain({ bpm: 96, beats: 40, driftBpm: -6, seed: 9 });
    expect(codes(analyseTiming(samples, {}))).toContain('timing.tempo_drift_down');
  });

  it('reports off-target tempo when playing 86 BPM against an 80 BPM target', () => {
    const { samples } = onsetTrain({ bpm: 86, beats: 30, seed: 10 });
    const r = analyseTiming(samples, { targetTempoBpm: 80 });
    expect(codes(r)).toContain('timing.off_target_tempo');
    expect(r.tempo.targetDeltaBpm!).toBeCloseTo(6, 0);
  });

  it('reports steady timing for an accurate, steady take', () => {
    const { samples } = onsetTrain({ bpm: 100, beats: 32, jitterMs: 4, seed: 11 });
    const r = analyseTiming(samples, { targetTempoBpm: 100 });
    expect(codes(r)).toEqual(['timing.steady']);
    expect(r.tempo.meanAbsOffsetMs!).toBeLessThan(15);
  });

  it('reports uneven subdivision for large random timing errors', () => {
    const { samples } = onsetTrain({ bpm: 90, beats: 36, jitterMs: 45, seed: 12 });
    expect(codes(analyseTiming(samples, {}))).toContain('timing.uneven_subdivision');
  });

  it('finds no tempo in silence', () => {
    const r = analyseTiming(new Float32Array(22050 * 5), {});
    expect(r.tempo.bpm).toBeNull();
    expect(r.findings).toEqual([]);
  });
});

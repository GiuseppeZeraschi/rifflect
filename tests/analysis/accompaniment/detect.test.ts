/** Accompaniment detection (tasks.md T080, SC-008). */
import { detectAccompaniment } from '@/analysis/accompaniment/detect';
import { leadOverBacking, leadOverClick, leadOverLoop } from '../../helpers/synthMix';

describe('loop detection', () => {
  it.each([2000, 4500, 12_000])('finds a %i ms loop to within ±10 ms', (loopMs) => {
    const mix = leadOverLoop({ loopMs, durationMs: Math.max(30_000, loopMs * 3), seed: loopMs });
    const d = detectAccompaniment(mix.samples);
    expect(d.kind).toBe('loop');
    expect(Math.abs(d.loopLengthMs! - loopMs)).toBeLessThanOrEqual(10);
  });

  it('finds a quiet loop (0.5× the lead)', () => {
    const d = detectAccompaniment(leadOverLoop({ gain: 0.5, seed: 3 }).samples);
    expect(d.kind).toBe('loop');
  });
});

describe('classification', () => {
  it('recognises a click track', () => {
    const d = detectAccompaniment(leadOverClick({ seed: 4 }).samples);
    expect(d.kind).toBe('click');
    expect(Math.abs(d.clickPeriodMs! - 600)).toBeLessThanOrEqual(2);
  });

  it('recognises a non-repeating backing track', () => {
    expect(detectAccompaniment(leadOverBacking({ seed: 5 }).samples).kind).toBe('backing');
  });

  it('reports none for solo playing', () => {
    expect(detectAccompaniment(leadOverLoop({ gain: 0, seed: 6 }).samples).kind).toBe('none');
  });
});

describe('false alarms on solo takes (SC-008: ≤ 5%)', () => {
  it('finds no loop or backing in 20 varied solo takes', () => {
    let falseAlarms = 0;
    for (let i = 0; i < 20; i++) {
      const mix = leadOverLoop({ gain: 0, seed: 100 + i, bpm: 70 + i * 6, durationMs: 25_000 });
      if (detectAccompaniment(mix.samples).kind !== 'none') falseAlarms++;
    }
    expect(falseAlarms).toBe(0);
  });
});

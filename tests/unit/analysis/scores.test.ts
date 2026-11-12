import { techniqueScore, timingScore } from '@/analysis/scoring/scores';
import type { Finding } from '@/analysis/types';

const f = (severity: Finding['severity'], category: Finding['category'] = 'technique'): Finding => ({
  category,
  aspect: 'clarity',
  issueCode: 'technique.fret_buzz',
  severity,
  confidence: 0.8,
  startMs: 0,
  metrics: {},
});

describe('timingScore (research.md R9)', () => {
  it('maps mean |offset| linearly from 10 ms (100) to 100 ms (0)', () => {
    expect(timingScore(5, 0)).toBe(100);
    expect(timingScore(10, 0)).toBe(100);
    expect(timingScore(55, 0)).toBe(50);
    expect(timingScore(100, 0)).toBe(0);
    expect(timingScore(150, 0)).toBe(0);
  });
  it('takes up to 15 points off for drift above 3 BPM', () => {
    expect(timingScore(10, 3)).toBe(100);
    expect(timingScore(10, 6.5)).toBe(93); // halfway to full penalty
    expect(timingScore(10, -12)).toBe(85);
  });
  it('is null without timing data', () => {
    expect(timingScore(null, null)).toBeNull();
  });
});

describe('techniqueScore', () => {
  const seen = { frettingHand: 1, pickingHand: 1 };
  it('subtracts severity weights per minute (at least one minute)', () => {
    expect(techniqueScore([], 60_000, seen, true)).toBe(100);
    expect(techniqueScore([f('info'), f('minor'), f('moderate')], 30_000, seen, true)).toBe(83);
    expect(techniqueScore([f('major'), f('major')], 120_000, seen, true)).toBe(75);
  });
  it('ignores timing findings and floors at 0', () => {
    expect(techniqueScore([f('major', 'timing')], 60_000, seen, true)).toBe(100);
    expect(techniqueScore(Array(10).fill(f('major')), 60_000, seen, true)).toBe(0);
  });
  it('is null when nothing technical was assessed', () => {
    expect(techniqueScore([], 60_000, { frettingHand: 0.1, pickingHand: 0 }, false)).toBeNull();
    expect(techniqueScore([], 60_000, { frettingHand: 0.1, pickingHand: 0 }, true)).toBe(100);
  });
});

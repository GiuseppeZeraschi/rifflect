import { CATALOGUE } from '@/analysis/feedback-text/catalogue';
import { buildSummary, recurringText, renderFinding, renderText, SUMMARY_MAX } from '@/analysis/feedback-text/render';
import { ISSUE_CODES, type FeedbackPointOut, type SkillLevel } from '@/analysis/types';

const LEVELS: SkillLevel[] = ['beginner', 'intermediate', 'advanced'];
const sampleMetrics = {
  beat: 4, meanOffsetMs: -42, count: 7, barFrom: 3, barTo: 6, bpm: 96, spreadMs: 38, startBpm: 90, endBpm: 97,
  driftBpm: 7, playedBpm: 86, targetBpm: 80, deltaBpm: 6, direction: 'faster', meanAbsOffsetMs: 14, shiftBeats: 1,
  notes: 20, of: 20, firstAtMs: 42_000, fractionPct: 72, chordLike: 'no', meanPipDeg: 163, finger: 'ring',
  liftPctOfHand: 48, heldSeconds: 8, sizeVariationPct: 41, timingVariationPct: 12, mainly: 'size', pauses: 2,
  longestPauseMs: 2400, atMs: 42_000,
};

describe('feedback text catalogue', () => {
  it('covers every issue code at every skill level with non-empty text and no unfilled placeholders', () => {
    for (const code of ISSUE_CODES) {
      expect(CATALOGUE[code]).toBeDefined();
      for (const level of LEVELS) {
        const { observation, suggestion } = renderText(code, sampleMetrics, level);
        for (const t of [observation, suggestion, CATALOGUE[code].headline(sampleMetrics)]) {
          expect(t.length).toBeGreaterThan(5);
          expect(t).not.toMatch(/undefined|NaN|\{|\}/);
        }
      }
    }
  });

  it('words the same finding differently for beginners and advanced players', () => {
    const b = renderText('timing.rushing', sampleMetrics, 'beginner');
    const a = renderText('timing.rushing', sampleMetrics, 'advanced');
    expect(b.observation).not.toBe(a.observation);
    expect(b.suggestion).not.toBe(a.suggestion);
    expect(renderText('timing.rushing', sampleMetrics, 'intermediate').observation).toContain('bars 3–6');
  });

  it('formats times and rounds ms to 5', () => {
    const p = renderFinding(
      { category: 'technique', aspect: 'clarity', issueCode: 'technique.fret_buzz', severity: 'minor', confidence: 0.8, startMs: 42_300, metrics: { count: 3, of: 20, firstAtMs: 42_300 } },
      'beginner',
    );
    expect(p.observation).toContain('around 0:42');
    expect(renderText('timing.rushing', { ...sampleMetrics, meanOffsetMs: -42 }, 'advanced').observation).toContain('≈40 ms');
  });
});

describe('summary', () => {
  const point = (issueCode: FeedbackPointOut['issueCode'], severity: FeedbackPointOut['severity']): FeedbackPointOut => ({
    category: issueCode.startsWith('timing') ? 'timing' : 'technique', aspect: 'rhythm', issueCode, severity,
    confidence: 0.8, startMs: 0, observation: '', suggestion: '', metrics: sampleMetrics,
  });

  it('leads with problems and stays within 140 characters', () => {
    const s = buildSummary([point('timing.rushing', 'moderate'), point('technique.flat_fingers', 'minor'), point('technique.fret_buzz', 'minor'), point('technique.clean', 'info')], 'intermediate');
    expect(s).toMatch(/^Focus: Rushing beat 4, Flat fingers, Fret buzz/);
    expect(s.length).toBeLessThanOrEqual(SUMMARY_MAX);
  });

  it('celebrates a clean take', () => {
    expect(buildSummary([point('timing.steady', 'info'), point('technique.clean', 'info')], 'beginner')).toBe(
      'Steady timing and clean notes. Nice work!',
    );
  });

  it('builds recurring-issue text', () => {
    expect(recurringText('timing.rushing', { beat: 4 }, 6, 8)).toBe('Rushing beat 4 in 6 of your last 8 takes');
  });
});

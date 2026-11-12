import type { AnalysisResult, FeedbackPointOut, IssueCode, Severity } from '@/analysis/types';
import { findOrCreateItem } from '@/data/repositories/practiceItemsRepo';
import { upsertProfile } from '@/data/repositories/profileRepo';
import { needsMoreTakes, practiceStats, recurringIssues, scoreSeries } from '@/data/repositories/progressRepo';
import { saveReport } from '@/data/repositories/reportsRepo';
import { completeCapture, createTake, saveTake, setAnalysisStatus } from '@/data/repositories/takesRepo';
import { createTestDb } from '../../helpers/testDb';

const pt = (issueCode: IssueCode, severity: Severity = 'minor', metrics: Record<string, number | string> = {}): FeedbackPointOut => ({
  category: issueCode.startsWith('timing') ? 'timing' : 'technique',
  aspect: 'rhythm',
  issueCode,
  severity,
  confidence: 0.8,
  startMs: 0,
  observation: 'o',
  suggestion: 's',
  metrics,
});

function result(timing: number | null, technique: number | null, points: FeedbackPointOut[], kind: 'none' | 'loop' = 'none'): AnalysisResult {
  return {
    engineVersion: '1.0.0+t1',
    status: 'analysed',
    timingScore: timing,
    techniqueScore: technique,
    summary: 's',
    tempo: { bpm: 90, driftBpm: 0, meanAbsOffsetMs: 15, targetDeltaBpm: null },
    accompaniment: { kind, loopLengthMs: kind === 'loop' ? 8000 : null, timingReference: kind === 'none' ? 'own_playing' : 'accompaniment', separationConfidence: kind === 'none' ? null : 'good', liveOnsetMatchRate: null },
    coverage: { audio: 1, frettingHand: 1, pickingHand: 1, posture: 0 },
    limitations: [],
    points,
  };
}

function setup() {
  const t = createTestDb();
  upsertProfile(t.db, { handedness: 'right', skillLevel: 'beginner' });
  const add = (o: { day: number; hour?: number; item?: string; timing?: number | null; technique?: number | null; points?: FeedbackPointOut[]; kind?: 'none' | 'loop'; saved?: boolean; analysed?: boolean; durationMs?: number }) => {
    const recordedAt = new Date(2026, 9, o.day, o.hour ?? 18, 0).toISOString();
    const tk = createTake(t.db, { cameraPosition: 'front', accompanimentSetting: 'auto', recordedAt });
    completeCapture(t.db, tk.id, { durationMs: o.durationMs ?? 60_000, fileSizeBytes: 1, landmarksPath: null });
    if (o.saved !== false) saveTake(t.db, tk.id, { practiceItemId: o.item ? findOrCreateItem(t.db, o.item).id : null });
    if (o.analysed !== false) {
      saveReport(t.db, tk.id, result(o.timing === undefined ? 70 : o.timing, o.technique === undefined ? 60 : o.technique, o.points ?? [], o.kind), 1);
      setAnalysisStatus(t.db, tk.id, 'analysed');
    }
    return tk;
  };
  return { t, add };
}

describe('score series', () => {
  it('lists saved, analysed takes oldest first, per item or overall, keeping null scores as gaps', () => {
    const { t, add } = setup();
    const a = add({ day: 3, item: 'Riff', timing: 60 });
    const b = add({ day: 1, item: 'Riff', timing: 50, technique: null });
    add({ day: 2, item: 'Scales', timing: 90 });
    add({ day: 4, item: 'Riff', saved: false });
    add({ day: 5, item: 'Riff', analysed: false });
    const riff = findOrCreateItem(t.db, 'Riff').id;
    const series = scoreSeries(t.db, { practiceItemId: riff, filter: 'all' });
    expect(series.map((s) => s.takeId)).toEqual([b.id, a.id]);
    expect(series[0]).toMatchObject({ timingScore: 50, techniqueScore: null });
    expect(scoreSeries(t.db, { filter: 'all' })).toHaveLength(3);
    t.close();
  });

  it('filters solo vs accompanied takes', () => {
    const { t, add } = setup();
    add({ day: 1 });
    add({ day: 2, kind: 'loop' });
    add({ day: 3, kind: 'loop' });
    expect(scoreSeries(t.db, { filter: 'solo' })).toHaveLength(1);
    expect(scoreSeries(t.db, { filter: 'accompanied' }).map((s) => s.accompanimentKind)).toEqual(['loop', 'loop']);
    t.close();
  });

  it('needs at least 2 points for a trend', () => {
    const { t, add } = setup();
    add({ day: 1, item: 'Riff' });
    const riff = findOrCreateItem(t.db, 'Riff').id;
    expect(needsMoreTakes(scoreSeries(t.db, { practiceItemId: riff, filter: 'all' }))).toBe(true);
    add({ day: 2, item: 'Riff' });
    expect(needsMoreTakes(scoreSeries(t.db, { practiceItemId: riff, filter: 'all' }))).toBe(false);
    t.close();
  });
});

describe('recurring issues', () => {
  it('flags issues in ≥ 3 of the last takes and ≥ 40% of them, with first/last seen and typical severity', () => {
    const { t, add } = setup();
    const rush = (sev: Severity) => pt('timing.rushing', sev, { beat: 4 });
    add({ day: 1, points: [rush('minor'), pt('technique.flat_fingers')] });
    add({ day: 2, points: [rush('moderate')] });
    add({ day: 3, points: [pt('technique.clean', 'info')] });
    add({ day: 4, points: [rush('moderate'), pt('technique.flat_fingers')] });
    add({ day: 5, points: [pt('technique.fret_buzz')] });
    const issues = recurringIssues(t.db, {});
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({
      issueCode: 'timing.rushing',
      occurrences: 3,
      windowSize: 5,
      typicalSeverity: 'moderate',
      firstSeenAt: new Date(2026, 9, 1, 18).toISOString(),
      lastSeenAt: new Date(2026, 9, 4, 18).toISOString(),
      displayText: 'Rushing beat 4 in 3 of your last 5 takes',
    });
    t.close();
  });

  it('only looks at the last N takes and ignores positive points', () => {
    const { t, add } = setup();
    for (let d = 1; d <= 4; d++) add({ day: d, points: [pt('technique.fret_buzz')] });
    for (let d = 5; d <= 10; d++) add({ day: d, points: [pt('timing.steady', 'info')] });
    // Last 6 takes: no buzz. Last 10: buzz in 4 (40%), so it's recurring. Steady (info) never counts.
    expect(recurringIssues(t.db, { window: 6 })).toEqual([]);
    expect(recurringIssues(t.db, { window: 10 }).map((i) => i.issueCode)).toEqual(['technique.fret_buzz']);
    t.close();
  });

  it('can be limited to one practice item', () => {
    const { t, add } = setup();
    for (let d = 1; d <= 3; d++) add({ day: d, item: 'Riff', points: [pt('technique.muted_notes')] });
    for (let d = 4; d <= 9; d++) add({ day: d, item: 'Scales' });
    expect(recurringIssues(t.db, {})).toEqual([]); // 3 of 9 overall is < 40%
    const riff = findOrCreateItem(t.db, 'Riff').id;
    expect(recurringIssues(t.db, { practiceItemId: riff }).map((i) => i.issueCode)).toEqual(['technique.muted_notes']);
    t.close();
  });
});

describe('practice stats', () => {
  it('counts takes, total time and practice days per ISO week', () => {
    const { t, add } = setup();
    add({ day: 12, hour: 9, durationMs: 120_000 }); // Mon 12 Oct 2026
    add({ day: 12, hour: 20, durationMs: 60_000 }); // same day
    add({ day: 14, durationMs: 30_000 }); // Wed
    add({ day: 20, durationMs: 90_000 }); // Tue next week
    add({ day: 21, saved: false, durationMs: 999_000 }); // draft: not counted
    const s = practiceStats(t.db, {});
    expect(s.takes).toBe(4);
    expect(s.totalMs).toBe(300_000);
    expect(s.weeks).toEqual([
      { week: '2026-W42', days: 2 },
      { week: '2026-W43', days: 1 },
    ]);
    expect(s.averageDaysPerWeek).toBe(1.5);
    t.close();
  });
});

import { eq } from 'drizzle-orm';

import type { AnalysisResult } from '@/analysis/types';
import { feedbackPoint, feedbackReport, take } from '@/data/db/schema';
import { upsertProfile } from '@/data/repositories/profileRepo';
import { getReportWithPoints, saveReport } from '@/data/repositories/reportsRepo';
import { completeCapture, createTake, getTake, markInterrupted, saveTake, setAccompanimentSetting, setAnalysisStatus } from '@/data/repositories/takesRepo';
import { createTestDb } from '../../helpers/testDb';

function result(over: Partial<AnalysisResult> = {}): AnalysisResult {
  return {
    engineVersion: '1.0.0+t1',
    status: 'analysed',
    timingScore: 82,
    techniqueScore: 74,
    summary: 'Focus: Rushing beat 4.',
    tempo: { bpm: 96.4, driftBpm: 1.2, meanAbsOffsetMs: 18, targetDeltaBpm: null },
    accompaniment: { kind: 'none', loopLengthMs: null, timingReference: 'own_playing', separationConfidence: null, liveOnsetMatchRate: null },
    coverage: { audio: 1, frettingHand: 0.9, pickingHand: 0.8, posture: 0 },
    limitations: [{ code: 'posture_not_assessed', message: 'Posture is not assessed.' }],
    points: [
      { category: 'timing', aspect: 'rhythm', issueCode: 'timing.rushing', severity: 'moderate', confidence: 0.8, startMs: 4000, endMs: 20000, observation: 'o1', suggestion: 's1', metrics: { beat: 4 } },
      { category: 'technique', aspect: 'clarity', issueCode: 'technique.clean', severity: 'info', confidence: 0.7, startMs: 500, observation: 'o2', suggestion: 's2', metrics: {} },
    ],
    ...over,
  };
}

describe('takes and reports repositories', () => {
  let t: ReturnType<typeof createTestDb>;
  beforeEach(() => {
    t = createTestDb();
    upsertProfile(t.db, { handedness: 'left', skillLevel: 'advanced' });
  });
  afterEach(() => t.close());

  it('creates a take that copies handedness and skill level from the profile', () => {
    const tk = createTake(t.db, { cameraPosition: 'front', accompanimentSetting: 'auto', targetTempoBpm: 90 });
    expect(tk).toMatchObject({
      handednessAtRecording: 'left',
      skillLevelAtRecording: 'advanced',
      captureStatus: 'recording',
      analysisStatus: 'pending',
      saved: false,
      videoPath: `takes/${tk.id}/video.mp4`,
    });
    upsertProfile(t.db, { handedness: 'right' });
    expect(getTake(t.db, tk.id)!.handednessAtRecording).toBe('left'); // later changes don't re-interpret old takes
  });

  it('refuses to create a take before onboarding', () => {
    const fresh = createTestDb();
    expect(() => createTake(fresh.db, { cameraPosition: 'front', accompanimentSetting: 'auto' })).toThrow(/profile/);
    fresh.close();
  });

  it('marks takes under 5 s as too_short when capture completes', () => {
    const a = createTake(t.db, { cameraPosition: 'front', accompanimentSetting: 'auto' });
    completeCapture(t.db, a.id, { durationMs: 3_000, fileSizeBytes: 100, landmarksPath: null });
    expect(getTake(t.db, a.id)).toMatchObject({ captureStatus: 'complete', analysisStatus: 'too_short' });
    const b = createTake(t.db, { cameraPosition: 'front', accompanimentSetting: 'auto' });
    completeCapture(t.db, b.id, { durationMs: 60_000, fileSizeBytes: 5_000_000, landmarksPath: `takes/${b.id}/landmarks.jsonl` });
    expect(getTake(t.db, b.id)).toMatchObject({ captureStatus: 'complete', analysisStatus: 'pending', durationMs: 60_000 });
  });

  it('only saves complete or interrupted takes', () => {
    const rec = createTake(t.db, { cameraPosition: 'front', accompanimentSetting: 'auto' });
    expect(() => saveTake(t.db, rec.id)).toThrow(/still recording/);
    markInterrupted(t.db, rec.id, { durationMs: 12_000, fileSizeBytes: 900_000 });
    expect(getTake(t.db, rec.id)).toMatchObject({ captureStatus: 'partial', interrupted: true });
    saveTake(t.db, rec.id);
    expect(getTake(t.db, rec.id)!.saved).toBe(true);
  });

  it('writes a report with its points, replacing any earlier report', () => {
    const tk = createTake(t.db, { cameraPosition: 'front', accompanimentSetting: 'auto' });
    completeCapture(t.db, tk.id, { durationMs: 30_000, fileSizeBytes: 1, landmarksPath: null });
    saveReport(t.db, tk.id, result(), 1500);
    saveReport(t.db, tk.id, result({ timingScore: 90, points: [result().points[1]!] }), 1400);
    const r = getReportWithPoints(t.db, tk.id)!;
    expect(r.report).toMatchObject({ timingScore: 90, processingMs: 1400, detectedTempoBpm: 96.4, accompanimentKind: 'none', timingReference: 'own_playing' });
    expect(r.points.map((p) => p.issueCode)).toEqual(['technique.clean']);
    expect(t.db.select().from(feedbackReport).all()).toHaveLength(1);
  });

  it('keeps points in the engine order', () => {
    const tk = createTake(t.db, { cameraPosition: 'front', accompanimentSetting: 'auto' });
    completeCapture(t.db, tk.id, { durationMs: 30_000, fileSizeBytes: 1, landmarksPath: null });
    saveReport(t.db, tk.id, result(), 1500);
    expect(getReportWithPoints(t.db, tk.id)!.points.map((p) => p.issueCode)).toEqual(['timing.rushing', 'technique.clean']);
  });

  it('rejects a point outside the take and leaves the old report untouched', () => {
    const tk = createTake(t.db, { cameraPosition: 'front', accompanimentSetting: 'auto' });
    completeCapture(t.db, tk.id, { durationMs: 10_000, fileSizeBytes: 1, landmarksPath: null });
    saveReport(t.db, tk.id, result({ points: [result().points[1]!] }), 1000);
    expect(() => saveReport(t.db, tk.id, result(), 1000)).toThrow(/outside the take/); // rushing starts at 4 s, ends at 20 s
    expect(getReportWithPoints(t.db, tk.id)!.points).toHaveLength(1);
  });

  it('cascades report deletion to its points', () => {
    const tk = createTake(t.db, { cameraPosition: 'front', accompanimentSetting: 'auto' });
    completeCapture(t.db, tk.id, { durationMs: 30_000, fileSizeBytes: 1, landmarksPath: null });
    saveReport(t.db, tk.id, result(), 1500);
    t.db.delete(feedbackReport).where(eq(feedbackReport.takeId, tk.id)).run();
    expect(t.db.select().from(feedbackPoint).all()).toHaveLength(0);
  });

  it('stores accompaniment results and lets the setting change for re-analysis', () => {
    const tk = createTake(t.db, { cameraPosition: 'front', accompanimentSetting: 'auto' });
    completeCapture(t.db, tk.id, { durationMs: 30_000, fileSizeBytes: 1, landmarksPath: null });
    saveReport(t.db, tk.id, result({ accompaniment: { kind: 'loop', loopLengthMs: 4800, timingReference: 'accompaniment', separationConfidence: 'partial', liveOnsetMatchRate: 0.92 } }), 1000);
    expect(getReportWithPoints(t.db, tk.id)!.report).toMatchObject({ accompanimentKind: 'loop', loopLengthMs: 4800, timingReference: 'accompaniment', separationConfidence: 'partial', liveOnsetMatchRate: 0.92 });
    setAccompanimentSetting(t.db, tk.id, 'off');
    expect(getTake(t.db, tk.id)!.accompanimentSetting).toBe('off');
    expect(() => setAccompanimentSetting(t.db, tk.id, 'sometimes' as never)).toThrow(/Invalid/);
  });

  it('sets the analysis status', () => {
    const tk = createTake(t.db, { cameraPosition: 'front', accompanimentSetting: 'auto' });
    setAnalysisStatus(t.db, tk.id, 'failed');
    expect(t.db.select({ s: take.analysisStatus }).from(take).get()!.s).toBe('failed');
  });
});

/**
 * Feedback reports and points (tasks.md T054, data-model.md § FeedbackReport / FeedbackPoint).
 * Re-analysis replaces a take's report (FR-029). Writes are transactional: a rejected report leaves
 * the previous one untouched.
 */
import { asc, eq } from 'drizzle-orm';

import type { AnalysisResult } from '@/analysis/types';
import { feedbackPoint, feedbackReport, take, type FeedbackPointRow, type FeedbackReportRow } from '@/data/db/schema';
import type { Db } from '@/data/db/types';
import { newId } from '@/lib/ids';
import { nowIso } from '@/lib/time';

export function saveReport(db: Db, takeId: string, result: AnalysisResult, processingMs: number): FeedbackReportRow {
  const row = db.select({ durationMs: take.durationMs }).from(take).where(eq(take.id, takeId)).get();
  if (!row) throw new Error(`Take ${takeId} not found`);
  for (const p of result.points) {
    const end = p.endMs ?? p.startMs;
    if (p.startMs < 0 || p.startMs > row.durationMs || end > row.durationMs) {
      throw new Error(`Feedback point ${p.issueCode} at ${p.startMs}–${end} ms is outside the take (0–${row.durationMs} ms)`);
    }
  }
  const reportId = newId();
  db.transaction((tx) => {
    tx.delete(feedbackReport).where(eq(feedbackReport.takeId, takeId)).run(); // cascades to points
    tx.insert(feedbackReport)
      .values({
        id: reportId,
        takeId,
        analysisVersion: result.engineVersion,
        timingScore: result.timingScore,
        techniqueScore: result.techniqueScore,
        summary: result.summary,
        detectedTempoBpm: result.tempo.bpm,
        targetTempoDeltaBpm: result.tempo.targetDeltaBpm,
        tempoDriftBpm: result.tempo.driftBpm,
        meanAbsOffsetMs: result.tempo.meanAbsOffsetMs,
        accompanimentKind: result.accompaniment.kind,
        loopLengthMs: result.accompaniment.loopLengthMs,
        timingReference: result.accompaniment.timingReference,
        separationConfidence: result.accompaniment.separationConfidence,
        liveOnsetMatchRate: result.accompaniment.liveOnsetMatchRate,
        analysedCoverage: result.coverage,
        limitations: result.limitations,
        processingMs: Math.round(processingMs),
        createdAt: nowIso(),
      })
      .run();
    result.points.forEach((p, i) => {
      tx.insert(feedbackPoint)
        .values({
          id: newId(),
          reportId,
          category: p.category,
          aspect: p.aspect,
          issueCode: p.issueCode,
          severity: p.severity,
          confidence: p.confidence,
          startMs: p.startMs,
          endMs: p.endMs ?? null,
          observation: p.observation,
          suggestion: p.suggestion,
          metrics: p.metrics,
          sortOrder: i,
        })
        .run();
    });
  });
  return db.select().from(feedbackReport).where(eq(feedbackReport.id, reportId)).get()!;
}

export function getReportWithPoints(
  db: Db,
  takeId: string,
): { report: FeedbackReportRow; points: FeedbackPointRow[] } | undefined {
  const report = db.select().from(feedbackReport).where(eq(feedbackReport.takeId, takeId)).get();
  if (!report) return undefined;
  const points = db
    .select()
    .from(feedbackPoint)
    .where(eq(feedbackPoint.reportId, report.id))
    .orderBy(asc(feedbackPoint.sortOrder))
    .all();
  return { report, points };
}

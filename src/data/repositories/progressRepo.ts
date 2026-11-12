/**
 * Progress queries (tasks.md T096, FR-020/021/023/030, data-model.md § RecurringIssue / Progress aggregates).
 * Only saved, analysed takes with a report count.
 */
import { and, asc, desc, eq, inArray, ne, type SQL } from 'drizzle-orm';

import { recurringText } from '@/analysis/feedback-text/render';
import type { IssueCode } from '@/analysis/types';
import {
  feedbackPoint,
  feedbackReport,
  take,
  type AccompanimentKind,
  type Severity,
} from '@/data/db/schema';
import type { Db } from '@/data/db/types';
import { isoWeekKey, localDayKey } from '@/lib/time';

export type ProgressFilter = 'all' | 'solo' | 'accompanied';

export interface SeriesPoint {
  takeId: string;
  recordedAt: string;
  timingScore: number | null;
  techniqueScore: number | null;
  accompanimentKind: AccompanimentKind;
}

function conditions(practiceItemId: string | undefined, filter: ProgressFilter): SQL[] {
  const c: SQL[] = [eq(take.saved, true), eq(take.analysisStatus, 'analysed')];
  if (practiceItemId) c.push(eq(take.practiceItemId, practiceItemId));
  if (filter === 'solo') c.push(eq(feedbackReport.accompanimentKind, 'none'));
  if (filter === 'accompanied') c.push(ne(feedbackReport.accompanimentKind, 'none'));
  return c;
}

export function scoreSeriesQuery(db: Db, { practiceItemId, filter = 'all' }: { practiceItemId?: string; filter?: ProgressFilter }) {
  return db
    .select({
      takeId: take.id,
      recordedAt: take.recordedAt,
      timingScore: feedbackReport.timingScore,
      techniqueScore: feedbackReport.techniqueScore,
      accompanimentKind: feedbackReport.accompanimentKind,
    })
    .from(take)
    .innerJoin(feedbackReport, eq(feedbackReport.takeId, take.id))
    .where(and(...conditions(practiceItemId, filter)))
    .orderBy(asc(take.recordedAt));
}

export function scoreSeries(db: Db, opts: { practiceItemId?: string; filter?: ProgressFilter }): SeriesPoint[] {
  return scoreSeriesQuery(db, opts).all();
}

/** A trend needs at least two takes (Story 3 scenario 4). */
export function needsMoreTakes(series: SeriesPoint[]): boolean {
  return series.length < 2;
}

export interface RecurringIssue {
  issueCode: IssueCode;
  /** Takes in the window containing ≥ 1 point with this code. */
  occurrences: number;
  windowSize: number;
  firstSeenAt: string;
  lastSeenAt: string;
  typicalSeverity: Severity;
  /** e.g. "Rushing beat 4 in 6 of your last 8 takes" */
  displayText: string;
}

const MIN_OCCURRENCES = 3;
const MIN_SHARE = 0.4;

function mode<T>(values: T[]): T {
  const counts = new Map<T, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  return [...counts.entries()].reduce((a, b) => (b[1] > a[1] ? b : a))[0];
}

/**
 * Issues seen in ≥ 3 of the last N takes and in ≥ 40% of them (data-model.md § RecurringIssue).
 * Positive (info) points never count as issues.
 */
export function recurringIssues(
  db: Db,
  { practiceItemId, window = 10, filter = 'all' }: { practiceItemId?: string; window?: number; filter?: ProgressFilter },
): RecurringIssue[] {
  const recent = db
    .select({ takeId: take.id, recordedAt: take.recordedAt, reportId: feedbackReport.id })
    .from(take)
    .innerJoin(feedbackReport, eq(feedbackReport.takeId, take.id))
    .where(and(...conditions(practiceItemId, filter)))
    .orderBy(desc(take.recordedAt))
    .limit(window)
    .all();
  if (recent.length === 0) return [];
  const recordedAtByReport = new Map(recent.map((r) => [r.reportId, r.recordedAt]));
  const points = db
    .select({
      reportId: feedbackPoint.reportId,
      issueCode: feedbackPoint.issueCode,
      severity: feedbackPoint.severity,
      metrics: feedbackPoint.metrics,
    })
    .from(feedbackPoint)
    .where(and(inArray(feedbackPoint.reportId, [...recordedAtByReport.keys()]), ne(feedbackPoint.severity, 'info')))
    .all();

  const byCode = new Map<string, typeof points>();
  for (const p of points) byCode.set(p.issueCode, [...(byCode.get(p.issueCode) ?? []), p]);

  const out: RecurringIssue[] = [];
  for (const [code, list] of byCode) {
    const reports = new Set(list.map((p) => p.reportId));
    const occurrences = reports.size;
    if (occurrences < MIN_OCCURRENCES || occurrences / recent.length < MIN_SHARE) continue;
    const dates = [...reports].map((r) => recordedAtByReport.get(r)!).sort();
    // Describe it with the most common detail (e.g. the beat most often rushed).
    const beat = list.map((p) => p.metrics.beat).filter((b) => b !== undefined);
    const metrics = beat.length ? { ...list[0]!.metrics, beat: mode(beat) } : list[0]!.metrics;
    out.push({
      issueCode: code as IssueCode,
      occurrences,
      windowSize: recent.length,
      firstSeenAt: dates[0]!,
      lastSeenAt: dates[dates.length - 1]!,
      typicalSeverity: mode(list.map((p) => p.severity)),
      displayText: recurringText(code as IssueCode, metrics, occurrences, recent.length),
    });
  }
  return out.sort((a, b) => b.occurrences - a.occurrences || a.issueCode.localeCompare(b.issueCode));
}

export interface PracticeStats {
  takes: number;
  totalMs: number;
  /** Distinct local days with a saved take, per ISO week (oldest first). */
  weeks: { week: string; days: number }[];
  /** Mean of `weeks[].days` over the weeks that had practice. */
  averageDaysPerWeek: number;
}

/** FR-023: number of takes, total recorded time and practice days per week (saved takes). */
export function practiceStats(db: Db, { practiceItemId }: { practiceItemId?: string }): PracticeStats {
  const c: SQL[] = [eq(take.saved, true)];
  if (practiceItemId) c.push(eq(take.practiceItemId, practiceItemId));
  const rows = db.select({ recordedAt: take.recordedAt, durationMs: take.durationMs }).from(take).where(and(...c)).all();
  const daysByWeek = new Map<string, Set<string>>();
  for (const r of rows) {
    const week = isoWeekKey(r.recordedAt);
    if (!daysByWeek.has(week)) daysByWeek.set(week, new Set());
    daysByWeek.get(week)!.add(localDayKey(r.recordedAt));
  }
  const weeks = [...daysByWeek.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([week, days]) => ({ week, days: days.size }));
  return {
    takes: rows.length,
    totalMs: rows.reduce((s, r) => s + r.durationMs, 0),
    weeks,
    averageDaysPerWeek: weeks.length ? Math.round((weeks.reduce((s, w) => s + w.days, 0) / weeks.length) * 10) / 10 : 0,
  };
}

/** Live take + report + points for the feedback screen. */
import { asc, eq } from 'drizzle-orm';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';

import { db } from '@/data/db/client';
import { feedbackPoint, feedbackReport, take } from '@/data/db/schema';

export function useTakeFeedback(takeId: string) {
  const takeQ = useLiveQuery(db.select().from(take).where(eq(take.id, takeId)), [takeId]);
  const reportQ = useLiveQuery(db.select().from(feedbackReport).where(eq(feedbackReport.takeId, takeId)), [takeId]);
  const report = reportQ.data[0] ?? null;
  const pointsQ = useLiveQuery(
    db.select().from(feedbackPoint).where(eq(feedbackPoint.reportId, report?.id ?? '')).orderBy(asc(feedbackPoint.sortOrder)),
    [report?.id],
  );
  return {
    loaded: takeQ.updatedAt !== undefined,
    take: takeQ.data[0] ?? null,
    report,
    points: report ? pointsQ.data : [],
  };
}

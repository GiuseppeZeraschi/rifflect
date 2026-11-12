/**
 * Progress tab (tasks.md T097): score trends, recurring issues and practice stats.
 * The live series query watches the take and report tables; any change there (saving, labelling,
 * analysing, deleting a take) re-renders this screen, which recomputes the other aggregates.
 */
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { router } from 'expo-router';
import { useState } from 'react';

import { db } from '@/data/db/client';
import { listItems } from '@/data/repositories/practiceItemsRepo';
import { practiceStats, recurringIssues, scoreSeriesQuery, type ProgressFilter } from '@/data/repositories/progressRepo';
import { ProgressView } from '@/features/progress/ProgressView';

export default function ProgressScreen() {
  const [itemId, setItemId] = useState<string | null>(null);
  const [filter, setFilter] = useState<ProgressFilter>('all');
  const opts = { practiceItemId: itemId ?? undefined, filter };
  const series = useLiveQuery(scoreSeriesQuery(db, opts), [itemId, filter]);

  return (
    <ProgressView
      items={listItems(db)}
      itemId={itemId}
      onItem={setItemId}
      filter={filter}
      onFilter={setFilter}
      series={series.data}
      recurring={recurringIssues(db, opts)}
      stats={practiceStats(db, { practiceItemId: itemId ?? undefined })}
      onCompare={(a, b) => router.push(`/compare?a=${a}&b=${b}`)}
    />
  );
}

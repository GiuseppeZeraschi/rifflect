/** Progress screen component test (tasks.md T099). The Skia chart is replaced by a stub. */
import { fireEvent, render, screen } from '@testing-library/react-native';
import { useState } from 'react';
import { Text } from 'react-native';

import type { PracticeStats, ProgressFilter, RecurringIssue, SeriesPoint } from '@/data/repositories/progressRepo';
import { ProgressView } from '@/features/progress/ProgressView';

jest.mock('@/features/progress/ScoreChart', () => ({
  ScoreChart: ({ series }: { series: unknown[] }) => {
    const { Text: RNText } = jest.requireActual('react-native');
    return <RNText testID="chart-scores">{`${series.length} points`}</RNText>;
  },
}));

const point = (i: number, kind: 'none' | 'loop' = 'none'): SeriesPoint => ({
  takeId: `t${i}`,
  recordedAt: new Date(2026, 9, i + 1).toISOString(),
  timingScore: 60 + i,
  techniqueScore: 50 + i,
  accompanimentKind: kind,
});
const stats: PracticeStats = { takes: 5, totalMs: 300_000, weeks: [{ week: '2026-W42', days: 3 }], averageDaysPerWeek: 3 };
const rushing: RecurringIssue = {
  issueCode: 'timing.rushing',
  occurrences: 3,
  windowSize: 5,
  firstSeenAt: '2026-10-01T00:00:00.000Z',
  lastSeenAt: '2026-10-04T00:00:00.000Z',
  typicalSeverity: 'moderate',
  displayText: 'Rushing beat 4 in 3 of your last 5 takes',
};

/** Holds the filter state and filters the series the way the route's query would. */
function Harness({ series, onCompare }: { series: SeriesPoint[]; onCompare?: (a: string, b: string) => void }) {
  const [filter, setFilter] = useState<ProgressFilter>('all');
  const shown = series.filter((s) => filter === 'all' || (filter === 'solo') === (s.accompanimentKind === 'none'));
  return (
    <>
      <ProgressView items={[]} itemId={null} onItem={() => {}} filter={filter} onFilter={setFilter} series={shown} recurring={[rushing]} stats={stats} onCompare={onCompare} />
      <Text testID="filter-state">{filter}</Text>
    </>
  );
}

describe('ProgressView', () => {
  it('asks for more takes when there is only one', async () => {
    await render(<Harness series={[point(0)]} />);
    expect(screen.getByTestId('need-more-takes')).toBeTruthy();
    expect(screen.queryByTestId('chart-scores')).toBeNull();
  });

  it('renders the chart, a recurring issue and the stats with seeded data', async () => {
    await render(<Harness series={[point(0), point(1), point(2)]} />);
    expect(screen.getByTestId('chart-scores')).toHaveTextContent('3 points');
    expect(screen.getByTestId('recurring-issue-timing.rushing')).toHaveTextContent('Rushing beat 4 in 3 of your last 5 takes');
    expect(screen.getByTestId('stats-takes')).toHaveTextContent(/5/);
    expect(screen.getByTestId('stats-minutes')).toHaveTextContent(/5/);
    expect(screen.getByTestId('stats-days-per-week')).toHaveTextContent(/3/);
  });

  it('updates the series when the filter changes', async () => {
    await render(<Harness series={[point(0), point(1, 'loop'), point(2, 'loop'), point(3)]} />);
    expect(screen.getByTestId('chart-scores')).toHaveTextContent('4 points');
    await fireEvent.press(screen.getByTestId('progress-filter-accompanied'));
    expect(screen.getByTestId('filter-state')).toHaveTextContent('accompanied');
    expect(screen.getByTestId('chart-scores')).toHaveTextContent('2 points');
    await fireEvent.press(screen.getByTestId('progress-filter-solo'));
    expect(screen.getByTestId('chart-scores')).toHaveTextContent('2 points');
  });

  it('compares the first and latest take', async () => {
    const onCompare = jest.fn();
    await render(<Harness series={[point(0), point(1), point(2)]} onCompare={onCompare} />);
    await fireEvent.press(screen.getByTestId('compare-first-latest'));
    expect(onCompare).toHaveBeenCalledWith('t0', 't2');
  });
});

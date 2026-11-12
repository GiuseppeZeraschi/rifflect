/** Feedback screen component test (tasks.md T064). */
import { fireEvent, render, screen } from '@testing-library/react-native';

import type { FeedbackPointRow, FeedbackReportRow } from '@/data/db/schema';
import { FeedbackView } from '@/features/feedback/FeedbackView';

const report: FeedbackReportRow = {
  id: 'r1',
  takeId: 't1',
  analysisVersion: '1.0.0+t1',
  timingScore: 82,
  techniqueScore: null,
  summary: 'Focus: Rushing beat 4.',
  detectedTempoBpm: 96,
  targetTempoDeltaBpm: null,
  tempoDriftBpm: 1,
  meanAbsOffsetMs: 18,
  accompanimentKind: 'none',
  loopLengthMs: null,
  timingReference: 'own_playing',
  separationConfidence: null,
  liveOnsetMatchRate: null,
  analysedCoverage: { audio: 1, frettingHand: 0, pickingHand: 0, posture: 0 },
  limitations: [{ code: 'landmarks_missing', message: 'Hand tracking wasn’t available for this take.' }],
  processingMs: 900,
  createdAt: '2026-11-12T10:00:00.000Z',
};

const point = (i: number, startMs: number): FeedbackPointRow => ({
  id: `p${i}`,
  reportId: 'r1',
  category: i === 0 ? 'timing' : 'technique',
  aspect: i === 0 ? 'rhythm' : 'clarity',
  issueCode: i === 0 ? 'timing.rushing' : 'technique.clean',
  severity: i === 0 ? 'moderate' : 'info',
  confidence: 0.8,
  startMs,
  endMs: null,
  observation: i === 0 ? 'Beat 4 came about 40 ms early.' : 'Your notes rang out clearly.',
  suggestion: i === 0 ? 'Count the “and” before beat 4.' : 'Keep it up.',
  metrics: {},
  sortOrder: i,
});

describe('FeedbackView', () => {
  it('renders scores, summary, points and limitations', async () => {
    await render(<FeedbackView analysisStatus="analysed" report={report} points={[point(0, 42_000), point(1, 500)]} onSeek={() => {}} />);
    expect(screen.getByTestId('score-timing')).toHaveTextContent(/82/);
    expect(screen.getByText('Focus: Rushing beat 4.')).toBeTruthy();
    expect(screen.getByText('Beat 4 came about 40 ms early.')).toBeTruthy();
    expect(screen.getByText(/0:42/)).toBeTruthy();
    expect(screen.getByTestId('limitations')).toHaveTextContent(/Hand tracking/);
  });

  it('shows "Not enough data" for a null score', async () => {
    await render(<FeedbackView analysisStatus="analysed" report={report} points={[point(0, 1000)]} onSeek={() => {}} />);
    expect(screen.getByTestId('score-technique')).toHaveTextContent(/Not enough data/);
  });

  it('seeks the player to a point’s start time when tapped', async () => {
    const onSeek = jest.fn();
    await render(<FeedbackView analysisStatus="analysed" report={report} points={[point(0, 42_000), point(1, 500)]} onSeek={onSeek} />);
    await fireEvent.press(screen.getByTestId('feedback-point-0'));
    expect(onSeek).toHaveBeenCalledWith(42_000);
  });

  it('hides the points list when no playing was found', async () => {
    await render(<FeedbackView analysisStatus="no_playing" report={{ ...report, limitations: [] }} points={[]} onSeek={() => {}} />);
    expect(screen.getByTestId('feedback-no-playing')).toBeTruthy();
    expect(screen.queryByTestId('feedback-points')).toBeNull();
    expect(screen.queryByTestId('score-timing')).toBeNull();
  });

  it('explains takes that are too short', async () => {
    await render(<FeedbackView analysisStatus="too_short" report={null} points={[]} onSeek={() => {}} />);
    expect(screen.getByText('Takes need to be at least 5 seconds long.')).toBeTruthy();
  });

  it('offers a retry when analysis failed', async () => {
    const onRetry = jest.fn();
    await render(<FeedbackView analysisStatus="failed" report={null} points={[]} onSeek={() => {}} onRetry={onRetry} />);
    await fireEvent.press(screen.getByTestId('feedback-retry'));
    expect(onRetry).toHaveBeenCalled();
  });
});

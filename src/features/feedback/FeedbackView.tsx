/**
 * Feedback for one take (tasks.md T063, FR-009–013): scores, summary, points (tap → seek),
 * limitations, and the no-playing / too-short / analysing / failed states.
 * Presentational: data and the seek callback come from the route (app/take/[id]/index.tsx).
 */
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { AnalysisStatus, FeedbackPointRow, FeedbackReportRow } from '@/data/db/schema';
import { fontSize, radius, spacing, usePalette } from '@/ui/theme';

export interface FeedbackViewProps {
  analysisStatus: AnalysisStatus;
  report: FeedbackReportRow | null;
  points: FeedbackPointRow[];
  onSeek: (ms: number) => void;
  onRetry?: () => void;
  /** Video player (rendered above the scores). */
  video?: ReactNode;
  /** Save / discard / label actions (US2). */
  actions?: ReactNode;
}

export function formatClock(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function ScoreTile({ label, value, testID }: { label: string; value: number | null; testID: string }) {
  const p = usePalette();
  const text = value === null ? 'Not enough data' : `${value}`;
  return (
    <View
      testID={testID}
      accessible
      accessibilityLabel={value === null ? `${label}: not enough data` : `${label} ${value} out of 100`}
      style={[styles.tile, { backgroundColor: p.surface, borderColor: p.border }]}>
      <Text style={[styles.tileLabel, { color: p.textMuted }]}>{label}</Text>
      <Text style={[value === null ? styles.tileEmpty : styles.tileValue, { color: p.text }]}>{text}</Text>
    </View>
  );
}

function Message({ testID, title, body, children }: { testID: string; title: string; body: string; children?: ReactNode }) {
  const p = usePalette();
  return (
    <View testID={testID} style={[styles.message, { backgroundColor: p.surface }]}>
      <Text accessibilityRole="header" style={[styles.messageTitle, { color: p.text }]}>{title}</Text>
      <Text style={[styles.body, { color: p.textMuted }]}>{body}</Text>
      {children}
    </View>
  );
}

export function FeedbackView({ analysisStatus, report, points, onSeek, onRetry, video, actions }: FeedbackViewProps) {
  const p = usePalette();

  let content: ReactNode;
  if (analysisStatus === 'too_short') {
    content = <Message testID="feedback-too-short" title="Too short to analyse" body="Takes need to be at least 5 seconds long." />;
  } else if (analysisStatus === 'failed') {
    content = (
      <Message testID="feedback-failed" title="Analysis didn’t finish" body="Something went wrong while analysing this take. Your recording is safe.">
        {onRetry ? (
          <Pressable testID="feedback-retry" accessibilityRole="button" onPress={onRetry} style={[styles.retry, { backgroundColor: p.primary }]}>
            <Text style={{ color: p.onPrimary, fontWeight: '600' }}>Try again</Text>
          </Pressable>
        ) : null}
      </Message>
    );
  } else if (analysisStatus === 'pending' || analysisStatus === 'analysing' || !report) {
    content = <Message testID="feedback-waiting" title="Analysing…" body="Your feedback will appear here shortly." />;
  } else if (analysisStatus === 'no_playing') {
    content = (
      <Message
        testID="feedback-no-playing"
        title="We couldn’t find playing to analyse"
        body="We didn’t hear any guitar notes in this take. Check the phone can hear the guitar, and try again."
      />
    );
  } else {
    content = (
      <>
        <View style={styles.tiles}>
          <ScoreTile label="Timing" value={report.timingScore} testID="score-timing" />
          <ScoreTile label="Technique" value={report.techniqueScore} testID="score-technique" />
        </View>
        <Text testID="feedback-summary" style={[styles.summary, { color: p.text }]}>{report.summary}</Text>

        <View testID="feedback-points" style={styles.list}>
          {points.map((pt, i) => {
            const color = pt.category === 'timing' ? p.timing : p.technique;
            return (
              <Pressable
                key={pt.id}
                testID={`feedback-point-${i}`}
                accessibilityRole="button"
                accessibilityHint={`Plays the take from ${formatClock(pt.startMs)}`}
                onPress={() => onSeek(pt.startMs)}
                style={({ pressed }) => [styles.point, { borderColor: p.border, backgroundColor: pressed ? p.surface : p.background }]}>
                <View style={styles.pointHeader}>
                  <Text style={[styles.badge, { color, borderColor: color }]}>{pt.category === 'timing' ? 'Timing' : 'Technique'}</Text>
                  <Text style={[styles.time, { color: p.textMuted }]}>▶ {formatClock(pt.startMs)}</Text>
                </View>
                <Text style={[styles.body, { color: p.text }]}>{pt.observation}</Text>
                <Text style={[styles.body, { color: p.textMuted }]}>{pt.suggestion}</Text>
              </Pressable>
            );
          })}
        </View>
      </>
    );
  }

  const limitations = report && analysisStatus !== 'too_short' ? report.limitations : [];
  return (
    <View style={styles.root}>
      {video}
      {content}
      {limitations.length > 0 ? (
        <View testID="limitations" style={styles.list}>
          <Text accessibilityRole="header" style={[styles.sectionTitle, { color: p.text }]}>What we couldn’t check</Text>
          {limitations.map((l, i) => (
            <Text key={`${l.code}-${i}`} style={[styles.body, { color: p.textMuted }]}>• {l.message}</Text>
          ))}
        </View>
      ) : null}
      {actions}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: spacing.lg, padding: spacing.lg },
  tiles: { flexDirection: 'row', gap: spacing.md },
  tile: { flex: 1, borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, padding: spacing.md, gap: spacing.xs },
  tileLabel: { fontSize: fontSize.caption, fontWeight: '600', textTransform: 'uppercase' },
  tileValue: { fontSize: 34, fontWeight: '700' },
  tileEmpty: { fontSize: fontSize.body, fontWeight: '600' },
  summary: { fontSize: fontSize.title, fontWeight: '600', lineHeight: 26 },
  list: { gap: spacing.sm },
  point: { borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.md, padding: spacing.md, gap: spacing.xs },
  pointHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  badge: { fontSize: fontSize.caption, fontWeight: '700', borderWidth: 1, borderRadius: radius.sm, paddingHorizontal: 6, paddingVertical: 1 },
  time: { fontSize: fontSize.caption, fontWeight: '600' },
  body: { fontSize: fontSize.body, lineHeight: 22 },
  sectionTitle: { fontSize: fontSize.body, fontWeight: '700' },
  message: { borderRadius: radius.lg, padding: spacing.lg, gap: spacing.sm },
  messageTitle: { fontSize: fontSize.title, fontWeight: '700' },
  retry: { alignSelf: 'flex-start', borderRadius: radius.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, marginTop: spacing.sm },
});

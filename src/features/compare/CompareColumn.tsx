/** One side of the compare screen (tasks.md T098): video, scores and the top points of a take. */
import { useVideoPlayer, VideoView } from 'expo-video';
import { StyleSheet, Text, View } from 'react-native';

import { takeFiles } from '@/data/files';
import { formatClock } from '@/features/feedback/FeedbackView';
import { useTakeFeedback } from '@/features/feedback/useTakeFeedback';
import { formatDate } from '@/features/library/TakeListItem';
import { fontSize, radius, spacing, usePalette } from '@/ui/theme';

export function CompareColumn({ takeId, testID }: { takeId: string; testID: string }) {
  const p = usePalette();
  const { take, report, points } = useTakeFeedback(takeId);
  const player = useVideoPlayer(take ? takeFiles.toAbsolute(take.videoPath) : null);
  if (!take) {
    return (
      <View testID={testID} style={styles.col}>
        <Text style={{ color: p.textMuted }}>This take no longer exists.</Text>
      </View>
    );
  }
  const top = points.filter((pt) => pt.severity !== 'info').slice(0, 3);
  return (
    <View testID={testID} style={styles.col}>
      <Text style={[styles.date, { color: p.text }]}>{formatDate(take.recordedAt)}</Text>
      <VideoView player={player} nativeControls contentFit="contain" style={styles.video} />
      <View style={styles.scores}>
        <Text style={[styles.score, { color: p.timing }]}>Timing {report?.timingScore ?? '–'}</Text>
        <Text style={[styles.score, { color: p.technique }]}>Technique {report?.techniqueScore ?? '–'}</Text>
      </View>
      {report ? <Text style={[styles.summary, { color: p.text }]}>{report.summary}</Text> : null}
      {top.map((pt) => (
        <View key={pt.id} style={[styles.point, { borderColor: p.border }]}>
          <Text style={[styles.small, { color: p.textMuted }]}>{formatClock(pt.startMs)}</Text>
          <Text style={[styles.small, { color: p.text }]}>{pt.observation}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  col: { flex: 1, gap: spacing.sm, minWidth: 0 },
  date: { fontSize: fontSize.body, fontWeight: '700' },
  video: { width: '100%', aspectRatio: 16 / 9, backgroundColor: '#000', borderRadius: radius.sm },
  scores: { flexDirection: 'row', gap: spacing.md, flexWrap: 'wrap' },
  score: { fontSize: fontSize.body, fontWeight: '700' },
  summary: { fontSize: fontSize.body },
  point: { borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.sm, padding: spacing.sm, gap: 2 },
  small: { fontSize: fontSize.caption },
});

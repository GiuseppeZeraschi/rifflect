/**
 * What the app found about accompaniment, plus re-analysis in the other mode (tasks.md T092,
 * FR-025, FR-028, FR-029). The new report replaces the old one.
 */
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { db } from '@/data/db/client';
import type { FeedbackReportRow, TakeRow } from '@/data/db/schema';
import { setAccompanimentSetting } from '@/data/repositories/takesRepo';
import { analysisQueue } from '@/jobs';
import { fontSize, radius, spacing, usePalette } from '@/ui/theme';

const SEPARATION_LABEL = { good: 'good', partial: 'partial', poor: 'poor' } as const;

export function accompanimentSummary(report: Pick<FeedbackReportRow, 'accompanimentKind' | 'loopLengthMs' | 'separationConfidence'>): string | null {
  const sep = report.separationConfidence ? ` · Separation: ${SEPARATION_LABEL[report.separationConfidence]}` : '';
  switch (report.accompanimentKind) {
    case 'loop':
      return `Loop detected · ${((report.loopLengthMs ?? 0) / 1000).toFixed(1)} s loop${sep}`;
    case 'backing':
      return `Backing track${sep}`;
    case 'click':
      return `Click track detected${sep}`;
    default:
      return null;
  }
}

function reanalyse(takeId: string, setting: 'on' | 'off') {
  setAccompanimentSetting(db, takeId, setting);
  analysisQueue.enqueue(takeId);
  router.push(`/take/${takeId}/analysing`);
}

export function AccompanimentBanner({ take, report }: { take: TakeRow; report: FeedbackReportRow }) {
  const p = usePalette();
  const summary = accompanimentSummary(report);
  const link = (label: string, testID: string, onPress: () => void) => (
    <Pressable testID={testID} accessibilityRole="button" onPress={onPress} style={styles.link}>
      <Text style={{ color: p.primary, fontWeight: '600', fontSize: fontSize.body }}>{label}</Text>
    </Pressable>
  );

  if (!summary) {
    return link('Were you playing over a loop or backing? Re-analyse', 'reanalyse-with-accompaniment', () => reanalyse(take.id, 'on'));
  }
  return (
    <View testID="accompaniment-banner" style={[styles.banner, { backgroundColor: p.surface, borderColor: p.border }]}>
      <Text style={[styles.title, { color: p.text }]}>{summary}</Text>
      <Text style={{ color: p.textMuted, fontSize: fontSize.caption }}>
        Timing is measured against the {report.accompanimentKind === 'click' ? 'click' : report.accompanimentKind === 'loop' ? 'loop' : 'backing'}, and only your live playing is judged.
      </Text>
      {link('Not right? Re-analyse as solo playing', 'reanalyse-as-solo', () => reanalyse(take.id, 'off'))}
    </View>
  );
}

const styles = StyleSheet.create({
  banner: { borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.md, padding: spacing.md, gap: spacing.xs },
  title: { fontSize: fontSize.body, fontWeight: '700' },
  link: { paddingVertical: spacing.xs, minHeight: 40, justifyContent: 'center' },
});

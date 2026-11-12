/**
 * Progress (tasks.md T097, Story 3): item picker, solo/accompanied filter, score chart, recurring
 * issues, practice stats, and "compare first and latest". Presentational; data comes from the route.
 */
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import type { PracticeItemRow } from '@/data/db/schema';
import type { PracticeStats, ProgressFilter, RecurringIssue, SeriesPoint } from '@/data/repositories/progressRepo';
import { fontSize, radius, spacing, usePalette } from '@/ui/theme';
import { ScoreChart } from './ScoreChart';

export interface ProgressViewProps {
  items: PracticeItemRow[];
  itemId: string | null;
  onItem: (id: string | null) => void;
  filter: ProgressFilter;
  onFilter: (f: ProgressFilter) => void;
  series: SeriesPoint[];
  recurring: RecurringIssue[];
  stats: PracticeStats;
  onCompare?: (a: string, b: string) => void;
}

function Chip({ label, selected, onPress, testID }: { label: string; selected: boolean; onPress: () => void; testID: string }) {
  const p = usePalette();
  return (
    <Pressable
      testID={testID}
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      onPress={onPress}
      style={[styles.chip, { borderColor: selected ? p.primary : p.border, backgroundColor: selected ? p.surface : p.background }]}>
      <Text style={{ color: p.text, fontSize: fontSize.body }}>{label}</Text>
    </Pressable>
  );
}

const FILTERS: { value: ProgressFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'solo', label: 'Solo' },
  { value: 'accompanied', label: 'With loop/backing' },
];

export function ProgressView({ items, itemId, onItem, filter, onFilter, series, recurring, stats, onCompare }: ProgressViewProps) {
  const p = usePalette();
  const minutes = Math.round(stats.totalMs / 60_000);
  const enough = series.length >= 2;

  return (
    <ScrollView style={{ backgroundColor: p.background }} contentContainerStyle={styles.content}>
      <View testID="progress-item-picker" accessibilityRole="radiogroup" accessibilityLabel="Practice item" style={styles.chips}>
        <Chip label="Everything" selected={itemId === null} onPress={() => onItem(null)} testID="progress-item-all" />
        {items.map((it) => (
          <Chip key={it.id} label={it.name} selected={itemId === it.id} onPress={() => onItem(it.id)} testID={`progress-item-${it.id}`} />
        ))}
      </View>
      <View testID="progress-accompaniment-filter" accessibilityRole="radiogroup" accessibilityLabel="Solo or accompanied" style={styles.chips}>
        {FILTERS.map((f) => (
          <Chip key={f.value} label={f.label} selected={filter === f.value} onPress={() => onFilter(f.value)} testID={`progress-filter-${f.value}`} />
        ))}
      </View>

      {enough ? (
        <ScoreChart series={series} />
      ) : (
        <View testID="need-more-takes" style={[styles.card, { backgroundColor: p.surface }]}>
          <Text style={[styles.cardTitle, { color: p.text }]}>Not enough takes yet</Text>
          <Text style={[styles.body, { color: p.textMuted }]}>
            Save at least two analysed takes{itemId ? ' with this label' : ''} to see how your scores change.
          </Text>
        </View>
      )}

      {enough && onCompare ? (
        <Pressable
          testID="compare-first-latest"
          accessibilityRole="button"
          onPress={() => onCompare(series[0]!.takeId, series[series.length - 1]!.takeId)}
          style={[styles.button, { borderColor: p.border }]}>
          <Text style={{ color: p.primary, fontWeight: '600', fontSize: fontSize.body }}>Compare first and latest take</Text>
        </Pressable>
      ) : null}

      <View style={styles.section}>
        <Text accessibilityRole="header" style={[styles.sectionTitle, { color: p.text }]}>Things that keep coming up</Text>
        {recurring.length === 0 ? (
          <Text style={[styles.body, { color: p.textMuted }]}>No recurring issues in your recent takes.</Text>
        ) : (
          recurring.map((r) => (
            <View key={r.issueCode} testID={`recurring-issue-${r.issueCode}`} style={[styles.issue, { borderColor: p.border }]}>
              <Text style={[styles.body, { color: p.text }]}>{r.displayText}</Text>
            </View>
          ))
        )}
      </View>

      <View style={styles.section}>
        <Text accessibilityRole="header" style={[styles.sectionTitle, { color: p.text }]}>Practice</Text>
        <View style={styles.stats}>
          <Stat testID="stats-takes" value={`${stats.takes}`} label={stats.takes === 1 ? 'take' : 'takes'} />
          <Stat testID="stats-minutes" value={`${minutes}`} label={minutes === 1 ? 'minute recorded' : 'minutes recorded'} />
          <Stat testID="stats-days-per-week" value={`${stats.averageDaysPerWeek}`} label="days a week" />
        </View>
      </View>
    </ScrollView>
  );
}

function Stat({ value, label, testID }: { value: string; label: string; testID: string }) {
  const p = usePalette();
  return (
    <View testID={testID} accessible accessibilityLabel={`${value} ${label}`} style={[styles.stat, { backgroundColor: p.surface }]}>
      <Text style={[styles.statValue, { color: p.text }]}>{value}</Text>
      <Text style={[styles.statLabel, { color: p.textMuted }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, gap: spacing.lg },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: { borderWidth: 2, borderRadius: radius.lg, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, minHeight: 40, justifyContent: 'center' },
  card: { borderRadius: radius.lg, padding: spacing.lg, gap: spacing.xs },
  cardTitle: { fontSize: fontSize.title, fontWeight: '700' },
  body: { fontSize: fontSize.body, lineHeight: 22 },
  button: { borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.md, padding: spacing.md, alignItems: 'center', minHeight: 48, justifyContent: 'center' },
  section: { gap: spacing.sm },
  sectionTitle: { fontSize: fontSize.title, fontWeight: '700' },
  issue: { borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.md, padding: spacing.md },
  stats: { flexDirection: 'row', gap: spacing.sm },
  stat: { flex: 1, borderRadius: radius.md, padding: spacing.md, alignItems: 'center' },
  statValue: { fontSize: 26, fontWeight: '700' },
  statLabel: { fontSize: fontSize.caption, textAlign: 'center' },
});

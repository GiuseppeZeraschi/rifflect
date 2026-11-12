/** One take in the library: thumbnail, date, length, label, summary line and both scores. */
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { takeFiles } from '@/data/files';
import type { LibraryRow } from '@/data/repositories/takesRepo';
import { formatClock } from '@/features/feedback/FeedbackView';
import { fontSize, radius, spacing, usePalette } from '@/ui/theme';

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export function TakeListItem({
  row,
  onPress,
  testID,
  footer,
  selected,
}: {
  row: LibraryRow;
  onPress: () => void;
  testID: string;
  footer?: string;
  /** Compare mode: true/false shows a selection state; undefined = normal list. */
  selected?: boolean;
}) {
  const p = usePalette();
  const name = row.title ?? row.label ?? 'Unlabelled';
  const scores =
    row.timingScore !== null || row.techniqueScore !== null
      ? `Timing ${row.timingScore ?? '–'} · Technique ${row.techniqueScore ?? '–'}`
      : row.analysisStatus === 'analysed' || row.analysisStatus === 'no_playing'
        ? 'No scores'
        : 'Not analysed yet';
  return (
    <Pressable
      testID={testID}
      accessibilityRole={selected === undefined ? "button" : "checkbox"}
      accessibilityState={selected === undefined ? undefined : { checked: selected }}
      accessibilityLabel={`${name}, ${formatDate(row.recordedAt)}, ${formatClock(row.durationMs)}. ${scores}`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        { borderColor: selected ? p.primary : p.border, borderWidth: selected ? 2 : StyleSheet.hairlineWidth, backgroundColor: pressed || selected ? p.surface : p.background },
      ]}>
      <Image source={{ uri: takeFiles.toAbsolute(row.thumbPath) }} style={[styles.thumb, { backgroundColor: p.surface }]} />
      <View style={styles.text}>
        <Text numberOfLines={1} style={[styles.name, { color: p.text }]}>
          {name}
          {row.title && row.label ? <Text style={{ color: p.textMuted }}> · {row.label}</Text> : null}
        </Text>
        <Text style={[styles.meta, { color: p.textMuted }]}>
          {formatDate(row.recordedAt)} · {formatClock(row.durationMs)}
        </Text>
        {row.summary ? (
          <Text numberOfLines={1} style={[styles.meta, { color: p.text }]}>
            {row.summary}
          </Text>
        ) : null}
        <Text style={[styles.meta, { color: p.textMuted }]}>{footer ?? scores}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing.md, padding: spacing.sm, borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.md },
  thumb: { width: 96, height: 64, borderRadius: radius.sm },
  text: { flex: 1, gap: 2, justifyContent: 'center' },
  name: { fontSize: fontSize.body, fontWeight: '600' },
  meta: { fontSize: fontSize.caption },
});

/**
 * "Not saved yet" (tasks.md T074, FR-015, Story 2 scenario 5): takes the user left without saving
 * or discarding, with the time until they're removed. Hidden when there are none.
 */
import { router } from 'expo-router';
import { Alert, StyleSheet, Text, View } from 'react-native';

import type { DraftRow } from '@/data/repositories/takesRepo';
import { fontSize, spacing, usePalette } from '@/ui/theme';
import { takeService } from './takeActions';
import { TakeListItem } from './TakeListItem';

export function hoursLeft(removeAt: string, now = Date.now()): string {
  const h = Math.max(0, Math.ceil((Date.parse(removeAt) - now) / 3_600_000));
  return h <= 1 ? 'Removed within the hour' : `Removed in ${h}h`;
}

export function UnsavedSection({ drafts }: { drafts: DraftRow[] }) {
  const p = usePalette();
  if (drafts.length === 0) return null;
  return (
    <View testID="library-unsaved" style={styles.root}>
      <Text accessibilityRole="header" style={[styles.title, { color: p.text }]}>Not saved yet</Text>
      <Text style={[styles.hint, { color: p.textMuted }]}>Open a take to save it. Unsaved takes are removed after 24 hours.</Text>
      {drafts.map((d) => (
        <View key={d.id}>
          <TakeListItem
            row={d}
            testID={`unsaved-item-${d.id}`}
            footer={hoursLeft(d.removeAt)}
            onPress={() => router.push(`/take/${d.id}`)}
          />
          <Text
            testID={`unsaved-discard-${d.id}`}
            accessibilityRole="button"
            onPress={() =>
              Alert.alert('Discard this take?', 'The recording and its feedback will be deleted.', [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Discard', style: 'destructive', onPress: () => takeService.discardDraft(d.id) },
              ])
            }
            style={[styles.discard, { color: p.danger }]}>
            Discard
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: spacing.sm },
  title: { fontSize: fontSize.title, fontWeight: '700' },
  hint: { fontSize: fontSize.caption },
  discard: { alignSelf: 'flex-end', paddingVertical: spacing.xs, paddingHorizontal: spacing.sm, fontWeight: '600' },
});

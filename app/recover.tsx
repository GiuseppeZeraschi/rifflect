/**
 * Recovered takes (tasks.md T077, spec edge case "interrupted"): takes cut short by a call or the
 * app closing, offered for analysis or discard; plus a notice for recordings that were lost.
 */
import { and, desc, eq } from 'drizzle-orm';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { router, Stack } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { db } from '@/data/db/client';
import { take } from '@/data/db/schema';
import { formatClock } from '@/features/feedback/FeedbackView';
import { takeService } from '@/features/library/takeActions';
import { formatDate } from '@/features/library/TakeListItem';
import { recoveryStore, useRecovery } from '@/jobs/startup';
import { Body, Button, Heading, Screen } from '@/ui/components/controls';
import { radius, spacing, usePalette } from '@/ui/theme';

export default function RecoverScreen() {
  const p = usePalette();
  const lostCount = useRecovery((s) => s.lostCount);
  const { data: interrupted } = useLiveQuery(
    db.select().from(take).where(and(eq(take.saved, false), eq(take.interrupted, true))).orderBy(desc(take.recordedAt)),
  );

  return (
    <Screen testID="recover-screen">
      <Stack.Screen options={{ title: 'Recovered takes' }} />
      {lostCount > 0 ? (
        <View testID="recover-lost-notice" style={[styles.notice, { backgroundColor: p.surface }]}>
          <Body>
            {lostCount === 1
              ? 'A recording was lost because the app closed unexpectedly.'
              : `${lostCount} recordings were lost because the app closed unexpectedly.`}
          </Body>
          <Button variant="secondary" label="OK" onPress={() => recoveryStore.getState().dismissLost()} />
        </View>
      ) : null}

      <Heading>{interrupted.length ? 'These takes were cut short' : 'Nothing to recover'}</Heading>
      {interrupted.length ? (
        <Body muted>A call or the app closing stopped these recordings. The recorded part can still be analysed.</Body>
      ) : null}

      {interrupted.map((t) => (
        <View key={t.id} style={[styles.card, { borderColor: p.border }]}>
          <Body>
            {formatDate(t.recordedAt)} · {formatClock(t.durationMs)}
          </Body>
          <View style={styles.row}>
            <Button
              testID={`recover-analyse-${t.id}`}
              label={t.analysisStatus === 'too_short' ? 'Open' : 'See feedback'}
              style={styles.flex}
              onPress={() => router.push(t.analysisStatus === 'pending' || t.analysisStatus === 'analysing' ? `/take/${t.id}/analysing` : `/take/${t.id}`)}
            />
            <Button testID={`recover-discard-${t.id}`} variant="secondary" label="Discard" style={styles.flex} onPress={() => takeService.discardDraft(t.id)} />
          </View>
        </View>
      ))}

      <View style={styles.spacer} />
      <Button testID="recover-done" variant="secondary" label="Done" onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)/record'))} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  notice: { borderRadius: radius.md, padding: spacing.md, gap: spacing.sm },
  card: { borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.md, padding: spacing.md, gap: spacing.sm },
  row: { flexDirection: 'row', gap: spacing.sm },
  flex: { flex: 1 },
  spacer: { flexGrow: 1, minHeight: spacing.lg },
});

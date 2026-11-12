/**
 * Analysing screen (tasks.md T061): live progress; leaving is fine (a notice appears when done);
 * on completion it replaces itself with the feedback screen; on failure it offers a retry.
 */
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { useTakeFeedback } from '@/features/feedback/useTakeFeedback';
import { analysisProgress, analysisQueue, useAnalysisProgress } from '@/jobs';
import { Body, Button, Heading, Screen } from '@/ui/components/controls';
import { radius, spacing, usePalette } from '@/ui/theme';

export default function AnalysingScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { take } = useTakeFeedback(id);
  const progress = useAnalysisProgress((s) => s.progress[id] ?? 0);
  const liveStatus = useAnalysisProgress((s) => s.status[id]);
  const status = liveStatus ?? take?.analysisStatus;
  const p = usePalette();

  const done = status === 'analysed' || status === 'no_playing' || status === 'too_short';
  useEffect(() => {
    if (done) router.replace(`/take/${id}`);
  }, [done, id]);

  const leave = () => {
    analysisProgress.getState().markLeft(id);
    router.back();
  };

  return (
    <Screen testID="analysing-screen" scroll={false}>
      <Stack.Screen options={{ title: 'Analysing', headerBackVisible: false }} />
      {status === 'failed' ? (
        <>
          <Heading>Analysis didn’t finish</Heading>
          <Body muted>Your recording is safe. You can try again now or later from the take.</Body>
          <Button testID="analysis-retry" label="Try again" onPress={() => analysisQueue.retry(id)} />
          <Button testID="analysis-leave" variant="secondary" label="Leave" onPress={() => router.back()} />
        </>
      ) : (
        <>
          <Heading>Listening to your take…</Heading>
          <Body muted>Working out your timing and technique. This usually takes under half a minute.</Body>
          <View
            testID="analysis-progress"
            accessibilityRole="progressbar"
            accessibilityValue={{ min: 0, max: 100, now: Math.round(progress * 100) }}
            style={[styles.track, { backgroundColor: p.surface }]}>
            <View style={[styles.fill, { backgroundColor: p.primary, width: `${Math.round(progress * 100)}%` }]} />
          </View>
          <ActivityIndicator color={p.primary} />
          <View style={styles.spacer} />
          <Button testID="analysis-leave" variant="secondary" label="Leave – we’ll let you know when it’s ready" onPress={leave} />
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  track: { height: 10, borderRadius: radius.sm, overflow: 'hidden', marginTop: spacing.md },
  fill: { height: '100%' },
  spacer: { flexGrow: 1 },
});

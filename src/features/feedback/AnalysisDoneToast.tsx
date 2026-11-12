/**
 * "Feedback ready – View" notice (tasks.md T062). When a take whose analysing screen the user left
 * finishes (analysed, no playing or failed), this appears on whatever screen is open.
 */
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { analysisProgress, useAnalysisProgress } from '@/jobs';
import { fontSize, radius, spacing, usePalette } from '@/ui/theme';

const FINISHED = new Set(['analysed', 'no_playing', 'failed']);

export function AnalysisDoneToast() {
  const p = usePalette();
  const insets = useSafeAreaInsets();
  const readyId = useAnalysisProgress((s) => s.leftTakeIds.find((id) => FINISHED.has(s.status[id] ?? '')));
  const failed = useAnalysisProgress((s) => (readyId ? s.status[readyId] === 'failed' : false));
  if (!readyId) return null;

  const open = () => {
    analysisProgress.getState().clearLeft(readyId);
    router.push(`/take/${readyId}`);
  };

  return (
    <Pressable
      testID="analysis-done-toast"
      accessibilityRole="button"
      accessibilityLiveRegion="polite"
      onPress={open}
      style={[styles.toast, { bottom: insets.bottom + 72, backgroundColor: p.text }]}>
      <Text style={[styles.text, { color: p.background }]}>
        {failed ? 'Analysis didn’t finish – View' : 'Feedback ready – View'}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  toast: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    borderRadius: radius.lg,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    elevation: 6,
  },
  text: { fontSize: fontSize.body, fontWeight: '600', textAlign: 'center' },
});

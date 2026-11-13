/** Big record/stop button with the elapsed time and the 5:00 limit. */
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { MAX_RECORDING_MS } from '@/capture/config';
import type { RecordingState } from '@/capture/recordingController';
import { fontSize, spacing, usePalette } from '@/ui/theme';

/** m:ss, counting whole seconds elapsed (never shows 0:01 before a second has passed). */
export function formatElapsed(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function useElapsed(startedAt: number | null): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (startedAt == null) return;
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [startedAt]);
  return startedAt == null ? 0 : Math.max(0, now - startedAt);
}

export function RecordButton({
  state,
  startedAt,
  disabled,
  onStart,
  onStop,
}: {
  state: RecordingState;
  startedAt: number | null;
  disabled?: boolean;
  onStart: () => void;
  onStop: () => void;
}) {
  const p = usePalette();
  const elapsed = useElapsed(state === 'recording' ? startedAt : null);
  const recording = state === 'recording';
  const busy = state === 'starting' || state === 'stopping';
  const label = recording ? 'Stop recording' : 'Start recording';

  return (
    <View style={styles.root}>
      <Text testID="record-timer" style={[styles.timer, { color: recording ? p.danger : p.textMuted }]}>
        {formatElapsed(elapsed)} / {formatElapsed(MAX_RECORDING_MS)}
      </Text>
      <Pressable
        testID="record-button"
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ disabled: !!disabled || busy, busy }}
        disabled={!!disabled || busy}
        onPress={recording ? onStop : onStart}
        style={({ pressed }) => [styles.outer, { borderColor: p.text, opacity: disabled ? 0.4 : pressed ? 0.8 : 1 }]}>
        {busy ? (
          <ActivityIndicator color={p.text} />
        ) : (
          <View style={[recording ? styles.square : styles.circle, { backgroundColor: p.danger }]} />
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { alignItems: 'center', gap: spacing.sm },
  timer: { fontSize: fontSize.title, fontVariant: ['tabular-nums'], fontWeight: '600' },
  outer: { width: 76, height: 76, borderRadius: 38, borderWidth: 4, alignItems: 'center', justifyContent: 'center' },
  circle: { width: 58, height: 58, borderRadius: 29 },
  square: { width: 30, height: 30, borderRadius: 6 },
});

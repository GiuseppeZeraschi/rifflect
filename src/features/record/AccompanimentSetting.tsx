/**
 * Auto / On / Off accompaniment handling for the next take (tasks.md T091, FR-024).
 * The Record screen (T059) pre-selects `profile.lastAccompanimentSetting` and writes the choice back
 * when recording starts.
 */
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { AccompanimentSetting as Setting } from '@/data/db/schema';
import { fontSize, radius, spacing, usePalette } from '@/ui/theme';

const OPTIONS: { value: Setting; label: string; hint: string }[] = [
  { value: 'auto', label: 'Auto', hint: 'Detect a loop, backing track or click automatically' },
  { value: 'on', label: 'Over a loop', hint: 'Point the camera at your hands, and keep the loop a bit quieter than your live playing' },
  { value: 'off', label: 'Solo', hint: 'Just you playing' },
];

export function AccompanimentSetting({ value, onChange }: { value: Setting; onChange: (v: Setting) => void }) {
  const p = usePalette();
  const current = OPTIONS.find((o) => o.value === value)!;
  return (
    <View testID="accompaniment-setting" style={styles.root}>
      <View accessibilityRole="radiogroup" accessibilityLabel="Playing over a loop or backing track" style={[styles.segments, { borderColor: p.border }]}>
        {OPTIONS.map((o) => {
          const selected = o.value === value;
          return (
            <Pressable
              key={o.value}
              testID={`accompaniment-setting-${o.value}`}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected }}
              accessibilityHint={o.hint}
              onPress={() => onChange(o.value)}
              style={[styles.segment, { backgroundColor: selected ? p.primary : 'transparent' }]}>
              <Text style={{ color: selected ? p.onPrimary : p.text, fontWeight: '600', fontSize: fontSize.body }}>{o.label}</Text>
            </Pressable>
          );
        })}
      </View>
      <Text style={{ color: p.textMuted, fontSize: fontSize.caption }}>{current.hint}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: spacing.xs },
  segments: { flexDirection: 'row', borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.md, overflow: 'hidden' },
  segment: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
});

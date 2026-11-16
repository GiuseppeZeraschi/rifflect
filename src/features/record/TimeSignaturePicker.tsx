/** Time signature for the next take: 4/4, 3/4 or 6/8 (beat and bar numbers in feedback use it). */
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { TIME_SIGNATURES, type TimeSignature } from '@/data/db/schema';
import { fontSize, radius, spacing, usePalette } from '@/ui/theme';

const HINTS: Record<TimeSignature, string> = {
  '4/4': 'Four beats to a bar',
  '3/4': 'Three beats to a bar (waltz time)',
  '6/8': 'Six eighth-note beats to a bar; count the tempo in eighth notes',
};

export function TimeSignaturePicker({
  value,
  onChange,
}: {
  value: TimeSignature;
  onChange: (v: TimeSignature) => void;
}) {
  const p = usePalette();
  return (
    <View style={styles.row}>
      <Text style={{ color: p.text, fontSize: fontSize.body, flex: 1 }}>Time signature</Text>
      <View
        testID="time-signature"
        accessibilityRole="radiogroup"
        accessibilityLabel="Time signature"
        style={[styles.segments, { borderColor: p.border }]}
      >
        {TIME_SIGNATURES.map((ts) => {
          const selected = ts === value;
          return (
            <Pressable
              key={ts}
              testID={`time-signature-${ts.replace('/', '-')}`}
              accessibilityRole="radio"
              accessibilityLabel={ts}
              accessibilityState={{ checked: selected }}
              accessibilityHint={HINTS[ts]}
              onPress={() => onChange(ts)}
              style={[styles.segment, { backgroundColor: selected ? p.primary : 'transparent' }]}
            >
              <Text
                style={{
                  color: selected ? p.onPrimary : p.text,
                  fontWeight: '600',
                  fontSize: fontSize.body,
                }}
              >
                {ts}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  segments: {
    flexDirection: 'row',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  segment: {
    minWidth: 56,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
  },
});

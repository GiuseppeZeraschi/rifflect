/** Optional target tempo (FR-003): whole BPM 30–300, or empty for none. */
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { fontSize, radius, spacing, usePalette } from '@/ui/theme';
import { MAX_BPM, MIN_BPM, parseTempo } from './tempo';

export function TempoInput({ value, onChange, editable = true }: { value: string; onChange: (text: string) => void; editable?: boolean }) {
  const p = usePalette();
  const invalid = parseTempo(value) === undefined;
  return (
    <View style={styles.root}>
      <View style={styles.row}>
        <Text style={{ color: p.text, fontSize: fontSize.body, flex: 1 }}>Target tempo (optional)</Text>
        <TextInput
          testID="tempo-input"
          accessibilityLabel="Target tempo in beats per minute"
          value={value}
          onChangeText={(t) => onChange(t.replace(/[^\d]/g, '').slice(0, 3))}
          keyboardType="number-pad"
          placeholder="BPM"
          placeholderTextColor={p.textMuted}
          editable={editable}
          maxLength={3}
          style={[styles.input, { color: p.text, borderColor: invalid ? p.danger : p.border, backgroundColor: p.surface }]}
        />
      </View>
      {invalid ? (
        <Text testID="tempo-error" style={{ color: p.danger, fontSize: fontSize.caption }}>
          Enter a tempo between {MIN_BPM} and {MAX_BPM}, or leave it empty.
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: spacing.xs },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  input: { width: 88, minHeight: 44, borderWidth: 1, borderRadius: radius.md, paddingHorizontal: spacing.md, fontSize: fontSize.body, textAlign: 'center' },
});

/**
 * Tempo and metronome row. The tempo (whole BPM 30–300) is the optional target (FR-003); with the
 * metronome on it is also the click's tempo, and then it's required.
 */
import { StyleSheet, Switch, Text, TextInput, View } from 'react-native';

import { fontSize, radius, spacing, usePalette } from '@/ui/theme';
import { MAX_BPM, MIN_BPM, parseTempo } from './tempo';

export function TempoInput({
  value,
  onChange,
  metronomeOn,
  onMetronomeChange,
  editable = true,
}: {
  value: string;
  onChange: (text: string) => void;
  metronomeOn: boolean;
  onMetronomeChange: (on: boolean) => void;
  editable?: boolean;
}) {
  const p = usePalette();
  const tempo = parseTempo(value);
  const invalid = tempo === undefined;
  const missingForMetronome = metronomeOn && tempo === null;
  return (
    <View style={styles.root}>
      <View style={styles.row}>
        <Text style={{ color: p.text, fontSize: fontSize.body, flex: 1 }}>
          {metronomeOn ? 'Tempo' : 'Target tempo (optional)'}
        </Text>
        <TextInput
          testID="tempo-input"
          accessibilityLabel="Tempo in beats per minute"
          value={value}
          onChangeText={(t) => onChange(t.replace(/[^\d]/g, '').slice(0, 3))}
          keyboardType="number-pad"
          placeholder="BPM"
          placeholderTextColor={p.textMuted}
          editable={editable}
          maxLength={3}
          style={[
            styles.input,
            {
              color: p.text,
              borderColor: invalid || missingForMetronome ? p.danger : p.border,
              backgroundColor: p.surface,
            },
          ]}
        />
        <View style={styles.metronome}>
          <Text style={{ color: p.textMuted, fontSize: fontSize.caption }}>Click</Text>
          <Switch
            testID="metronome-toggle"
            accessibilityLabel="Metronome"
            value={metronomeOn}
            onValueChange={onMetronomeChange}
            disabled={!editable}
            trackColor={{ true: p.primary, false: p.border }}
            thumbColor={p.background}
          />
        </View>
      </View>
      {invalid ? (
        <Text testID="tempo-error" style={{ color: p.danger, fontSize: fontSize.caption }}>
          Enter a tempo between {MIN_BPM} and {MAX_BPM}
          {metronomeOn ? '.' : ', or leave it empty.'}
        </Text>
      ) : missingForMetronome ? (
        <Text testID="tempo-error" style={{ color: p.danger, fontSize: fontSize.caption }}>
          Enter a tempo for the metronome.
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: spacing.xs },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  input: {
    width: 80,
    minHeight: 44,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    fontSize: fontSize.body,
    textAlign: 'center',
  },
  metronome: { alignItems: 'center' },
});

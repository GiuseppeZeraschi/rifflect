/** Shared, accessible controls: Screen, Button and OptionGroup. Colours come from the theme. */
import type { ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { fontSize, radius, spacing, usePalette } from '@/ui/theme';

export function Screen({ children, scroll = true, testID }: { children: ReactNode; scroll?: boolean; testID?: string }) {
  const p = usePalette();
  const body = <View style={styles.body}>{children}</View>;
  return (
    <SafeAreaView testID={testID} style={[styles.flex, { backgroundColor: p.background }]} edges={['top', 'left', 'right']}>
      {scroll ? <ScrollView contentContainerStyle={styles.scroll}>{body}</ScrollView> : body}
    </SafeAreaView>
  );
}

export function Heading({ children }: { children: ReactNode }) {
  const p = usePalette();
  return (
    <Text accessibilityRole="header" style={[styles.heading, { color: p.text }]}>
      {children}
    </Text>
  );
}

export function Body({ children, muted, style }: { children: ReactNode; muted?: boolean; style?: object }) {
  const p = usePalette();
  return <Text style={[styles.body16, { color: muted ? p.textMuted : p.text }, style]}>{children}</Text>;
}

export function Button({
  label,
  onPress,
  testID,
  variant = 'primary',
  disabled,
  style,
}: {
  label: string;
  onPress: () => void;
  testID?: string;
  variant?: 'primary' | 'secondary' | 'danger';
  disabled?: boolean;
  style?: ViewStyle;
}) {
  const p = usePalette();
  const bg = variant === 'primary' ? p.primary : variant === 'danger' ? p.danger : p.surface;
  const fg = variant === 'secondary' ? p.text : p.onPrimary;
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: bg, borderColor: p.border, opacity: disabled ? 0.5 : pressed ? 0.8 : 1 },
        style,
      ]}>
      <Text style={[styles.buttonText, { color: fg }]}>{label}</Text>
    </Pressable>
  );
}

export interface Option<T extends string> {
  value: T;
  label: string;
  description?: string;
}

/** A vertical list of radio-style options. Each option gets testID `${testIDPrefix}-${value}`. */
export function OptionGroup<T extends string>({
  options,
  value,
  onChange,
  testIDPrefix,
  label,
}: {
  options: Option<T>[];
  value: T | null;
  onChange: (v: T) => void;
  testIDPrefix: string;
  label: string;
}) {
  const p = usePalette();
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={label} style={styles.options}>
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <Pressable
            key={o.value}
            testID={`${testIDPrefix}-${o.value}`}
            accessibilityRole="radio"
            accessibilityState={{ checked: selected }}
            accessibilityLabel={o.description ? `${o.label}. ${o.description}` : o.label}
            onPress={() => onChange(o.value)}
            style={[styles.option, { borderColor: selected ? p.primary : p.border, backgroundColor: selected ? p.surface : p.background }]}>
            <Text style={[styles.optionLabel, { color: p.text }]}>{o.label}</Text>
            {o.description ? <Text style={[styles.optionDesc, { color: p.textMuted }]}>{o.description}</Text> : null}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scroll: { flexGrow: 1 },
  body: { flex: 1, padding: spacing.lg, gap: spacing.md },
  heading: { fontSize: fontSize.heading, fontWeight: '700' },
  body16: { fontSize: fontSize.body, lineHeight: 22 },
  button: { minHeight: 48, borderRadius: radius.md, paddingHorizontal: spacing.lg, alignItems: 'center', justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth },
  buttonText: { fontSize: fontSize.body, fontWeight: '600' },
  options: { gap: spacing.sm },
  option: { minHeight: 48, borderWidth: 2, borderRadius: radius.md, padding: spacing.md, justifyContent: 'center' },
  optionLabel: { fontSize: fontSize.body, fontWeight: '600' },
  optionDesc: { fontSize: fontSize.caption, marginTop: 2 },
});

/**
 * Compare two takes (tasks.md T098, FR-022, Story 3 scenario 3): `/compare?a=<id>&b=<id>`.
 * Stacked on a portrait phone, side by side in landscape.
 */
import { Stack, useLocalSearchParams } from 'expo-router';
import { ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';

import { CompareColumn } from '@/features/compare/CompareColumn';
import { spacing, usePalette } from '@/ui/theme';

export default function CompareScreen() {
  const { a, b } = useLocalSearchParams<{ a: string; b: string }>();
  const { width, height } = useWindowDimensions();
  const p = usePalette();
  const sideBySide = width > height;
  return (
    <ScrollView testID="compare-screen" style={{ backgroundColor: p.background }} contentContainerStyle={styles.content}>
      <Stack.Screen options={{ title: 'Compare takes' }} />
      <View style={[styles.row, { flexDirection: sideBySide ? 'row' : 'column' }]}>
        <CompareColumn takeId={a} testID="compare-a" />
        <CompareColumn takeId={b} testID="compare-b" />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg },
  row: { gap: spacing.xl },
});

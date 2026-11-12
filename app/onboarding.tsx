import { StyleSheet } from 'react-native';

import { Text, View } from '@/ui/components/Themed';
import { fontSize, spacing } from '@/ui/theme';

/** Onboarding placeholder (app shell, T035). The real flow (permissions, handedness, skill) is T055. */
export default function OnboardingScreen() {
  return (
    <View testID="onboarding-welcome" style={styles.container}>
      <Text style={styles.title}>Welcome to Rifflect</Text>
      <Text>Setup comes next.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  title: { fontSize: fontSize.heading, fontWeight: 'bold' },
});

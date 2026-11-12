import { DarkTheme, DefaultTheme, router, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import 'react-native-reanimated';

import { useDbMigrations } from '@/data/db/client';
import { AnalysisDoneToast } from '@/features/feedback/AnalysisDoneToast';
import { useProfileGate } from '@/features/onboarding/useProfileGate';
import { startUp, useRecovery } from '@/jobs/startup';
import { useColorScheme } from '@/ui/components/useColorScheme';
import { fontSize, palettes, spacing } from '@/ui/theme';

export {
  // Catch any errors thrown by the Layout component.
  ErrorBoundary,
} from 'expo-router';

export const unstable_settings = {
  anchor: '(tabs)',
};

SplashScreen.preventAutoHideAsync();

/**
 * Root layout (tasks.md T035):
 * 1. Apply database migrations; show an error screen if they fail (never start on a broken schema).
 * 2. Start-up recovery (src/jobs/startup.ts), then re-queue takes pending analysis.
 * 3. Show /recover if takes were interrupted or lost.
 * 4. Route to onboarding until a player profile exists.
 */
export default function RootLayout() {
  const scheme = useColorScheme();
  const migrations = useDbMigrations();

  if (migrations.error) {
    const p = palettes[scheme];
    return (
      <View testID="app-root" style={[styles.center, { backgroundColor: p.background }]}>
        <Text style={[styles.errorTitle, { color: p.danger }]}>Rifflect couldn’t open its database</Text>
        <Text style={{ color: p.textMuted }}>{migrations.error.message}</Text>
      </View>
    );
  }
  if (!migrations.success) return null; // splash screen stays up

  return <AppNavigator />;
}

function AppNavigator() {
  const scheme = useColorScheme();
  const { ready, hasProfile } = useProfileGate();
  const recovered = useRecovery((s) => s.ran);
  const needsRecoverScreen = useRecovery((s) => s.interruptedIds.length > 0 || s.lostCount > 0);
  const shownRecover = useRef(false);

  // Recovery runs before the queue loads pending analyses (startUp does both, once).
  useEffect(() => {
    void startUp();
  }, []);

  useEffect(() => {
    if (ready) SplashScreen.hideAsync();
  }, [ready]);

  useEffect(() => {
    if (recovered && hasProfile && needsRecoverScreen && !shownRecover.current) {
      shownRecover.current = true;
      router.push('/recover');
    }
  }, [recovered, hasProfile, needsRecoverScreen]);

  if (!ready) return null;

  return (
    <View testID="app-root" style={styles.root}>
      <ThemeProvider value={scheme === 'dark' ? DarkTheme : DefaultTheme}>
        <Stack>
          <Stack.Protected guard={hasProfile}>
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="take/[id]/index" options={{ title: 'Feedback' }} />
            <Stack.Screen name="take/[id]/analysing" options={{ title: 'Analysing', gestureEnabled: false }} />
            <Stack.Screen name="take/[id]/edit" options={{ title: 'Edit take' }} />
            <Stack.Screen name="recover" options={{ title: 'Recovered takes' }} />
          </Stack.Protected>
          <Stack.Protected guard={!hasProfile}>
            <Stack.Screen name="onboarding" options={{ headerShown: false }} />
          </Stack.Protected>
        </Stack>
        {hasProfile ? <AnalysisDoneToast /> : null}
      </ThemeProvider>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: spacing.md },
  errorTitle: { fontSize: fontSize.title, fontWeight: '600' },
});

/**
 * The app's start route ("/"): onboarding until a profile exists, then the Record tab.
 * Without this, "/" matches no screen (the tabs have no index) and the router shows "not found".
 */
import { Redirect } from 'expo-router';

import { useProfileGate } from '@/features/onboarding/useProfileGate';

export default function Index() {
  const { ready, hasProfile } = useProfileGate();
  if (!ready) return null;
  return <Redirect href={hasProfile ? '/(tabs)/record' : '/onboarding'} />;
}

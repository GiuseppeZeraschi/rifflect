import { useCameraPermission, useMicrophonePermission } from 'react-native-vision-camera';

import { OnboardingFlow } from '@/features/onboarding/OnboardingFlow';
import { updateProfile } from '@/features/profile/useProfile';

/**
 * Onboarding route (tasks.md T055). Saving the profile flips the root layout's Stack.Protected
 * guards, which takes the user to the tabs (Record is the first tab).
 */
export default function OnboardingScreen() {
  const camera = useCameraPermission();
  const microphone = useMicrophonePermission();
  return <OnboardingFlow camera={camera} microphone={microphone} onFinish={(p) => updateProfile(p)} />;
}

/**
 * Onboarding (tasks.md T055): Welcome → camera & microphone → handedness → skill level → save.
 * Saving the profile flips the root layout's guard, which shows the tabs (Record first).
 * If a permission is refused, we explain why and offer the system settings; we never record without it.
 */
import { useState } from 'react';
import { Linking, StyleSheet, View } from 'react-native';

import type { Handedness, SkillLevel } from '@/data/db/schema';
import { HANDEDNESS_OPTIONS, SKILL_OPTIONS } from '@/features/profile/useProfile';
import { Body, Button, Heading, OptionGroup, Screen } from '@/ui/components/controls';
import { spacing } from '@/ui/theme';

export interface PermissionApi {
  hasPermission: boolean;
  canRequestPermission: boolean;
  requestPermission: () => Promise<boolean>;
}

export interface OnboardingProps {
  camera: PermissionApi;
  microphone: PermissionApi;
  onFinish: (profile: { handedness: Handedness; skillLevel: SkillLevel }) => void;
}

type Step = 'welcome' | 'permissions' | 'handedness' | 'skill';

export function OnboardingFlow({ camera, microphone, onFinish }: OnboardingProps) {
  const [step, setStep] = useState<Step>('welcome');
  const [handedness, setHandedness] = useState<Handedness | null>(null);
  const [skill, setSkill] = useState<SkillLevel | null>(null);
  const [denied, setDenied] = useState(false);

  const granted = camera.hasPermission && microphone.hasPermission;

  async function askPermissions() {
    const cam = camera.hasPermission || (await camera.requestPermission());
    const mic = microphone.hasPermission || (await microphone.requestPermission());
    if (cam && mic) {
      setDenied(false);
      setStep('handedness');
    } else {
      setDenied(true);
    }
  }

  if (step === 'welcome') {
    return (
      <Screen testID="onboarding-welcome">
        <Heading>Welcome to Rifflect</Heading>
        <Body>Record yourself playing and get feedback on your timing and technique.</Body>
        <Body muted>Everything happens on this phone. Your recordings never leave it unless you share them.</Body>
        <View style={styles.spacer} />
        <Button testID="onboarding-start" label="Get started" onPress={() => setStep(granted ? 'handedness' : 'permissions')} />
      </Screen>
    );
  }

  if (step === 'permissions') {
    return (
      <Screen testID="onboarding-permissions">
        <Heading>Camera and microphone</Heading>
        <Body>Rifflect uses the camera to see your hands and the microphone to hear your playing. It needs both to give feedback.</Body>
        {denied ? (
          <View style={styles.block} testID="permission-denied">
            <Body>
              Without camera and microphone access, Rifflect can’t record takes.{' '}
              {camera.canRequestPermission || microphone.canRequestPermission
                ? 'Tap Allow to try again.'
                : 'You can allow it in your phone’s settings.'}
            </Body>
            <Button testID="permission-open-settings" variant="secondary" label="Open Settings" onPress={() => Linking.openSettings()} />
          </View>
        ) : null}
        <View style={styles.spacer} />
        <Button testID="onboarding-allow" label="Allow camera and microphone" onPress={askPermissions} />
        {granted ? <Button testID="onboarding-continue" variant="secondary" label="Continue" onPress={() => setStep('handedness')} /> : null}
      </Screen>
    );
  }

  if (step === 'handedness') {
    return (
      <Screen testID="onboarding-handedness">
        <Heading>How do you play?</Heading>
        <OptionGroup label="Handedness" testIDPrefix="onboarding-handedness" options={HANDEDNESS_OPTIONS} value={handedness} onChange={setHandedness} />
        <View style={styles.spacer} />
        <Button testID="onboarding-next" label="Next" disabled={!handedness} onPress={() => setStep('skill')} />
      </Screen>
    );
  }

  return (
    <Screen testID="onboarding-skill">
      <Heading>What’s your level?</Heading>
      <Body muted>This sets how detailed and technical your feedback is. You can change it later in Settings.</Body>
      <OptionGroup label="Skill level" testIDPrefix="onboarding-skill" options={SKILL_OPTIONS} value={skill} onChange={setSkill} />
      <View style={styles.spacer} />
      <Button
        testID="onboarding-finish"
        label="Start playing"
        disabled={!skill || !handedness}
        onPress={() => handedness && skill && onFinish({ handedness, skillLevel: skill })}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  spacer: { flexGrow: 1, minHeight: spacing.lg },
  block: { gap: spacing.sm },
});

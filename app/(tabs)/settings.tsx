/** Settings (tasks.md T065, T076): handedness, skill level, camera, backup (Export all) and storage. */
import { ExportAll } from '@/features/settings/ExportAll';
import { CAMERA_OPTIONS, HANDEDNESS_OPTIONS, SKILL_OPTIONS, updateProfile, useProfile } from '@/features/profile/useProfile';
import { Body, Heading, OptionGroup, Screen } from '@/ui/components/controls';

export default function SettingsScreen() {
  const profile = useProfile();
  if (!profile) return <Screen>{null}</Screen>;
  return (
    <Screen testID="settings-screen">
      <Heading>Settings</Heading>
      <Body muted>Changes apply to new takes. Takes you’ve already recorded keep their original settings.</Body>

      <Body>How do you play?</Body>
      <OptionGroup
        label="Handedness"
        testIDPrefix="settings-handedness"
        options={HANDEDNESS_OPTIONS}
        value={profile.handedness}
        onChange={(handedness) => updateProfile({ handedness })}
      />

      <Body>Your level</Body>
      <OptionGroup
        label="Skill level"
        testIDPrefix="settings-skill"
        options={SKILL_OPTIONS}
        value={profile.skillLevel}
        onChange={(skillLevel) => updateProfile({ skillLevel })}
      />

      <Body>Camera</Body>
      <OptionGroup
        label="Preferred camera"
        testIDPrefix="settings-camera"
        options={CAMERA_OPTIONS}
        value={profile.preferredCamera}
        onChange={(preferredCamera) => updateProfile({ preferredCamera })}
      />

      <Body>Backup and storage</Body>
      <ExportAll />
    </Screen>
  );
}

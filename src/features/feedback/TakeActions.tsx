/**
 * Save / Discard / Label for a take (tasks.md T071, FR-015).
 * Leaving an unsaved take prompts Save / Discard / Keep for now. Kept drafts appear in the
 * library's "Not saved yet" section for 24 hours.
 */
import { router, useNavigation, usePreventRemove } from 'expo-router';
import { useRef, useState } from 'react';
import { Alert, Modal, StyleSheet, View } from 'react-native';

import type { TakeRow } from '@/data/db/schema';
import { LabelPicker } from '@/features/library/LabelPicker';
import { saveTakeWithLabel, takeService, type LabelChoice } from '@/features/library/takeActions';
import { Body, Button, Heading, Screen } from '@/ui/components/controls';
import { spacing } from '@/ui/theme';

export function TakeActions({ take }: { take: TakeRow }) {
  const navigation = useNavigation();
  const [saving, setSaving] = useState(false);
  const [label, setLabel] = useState<LabelChoice>(take.practiceItemId ? { itemId: take.practiceItemId } : null);
  const leavingAction = useRef<Parameters<typeof navigation.dispatch>[0] | null>(null);
  const [allowLeave, setAllowLeave] = useState(false);

  const isDraft = !take.saved && take.captureStatus !== 'recording';

  usePreventRemove(isDraft && !allowLeave, ({ data }) => {
    Alert.alert('Keep this take?', 'It isn’t saved yet. Unsaved takes are removed after 24 hours.', [
      { text: 'Keep for now', onPress: () => navigation.dispatch(data.action) },
      { text: 'Discard', style: 'destructive', onPress: () => discard(data.action) },
      {
        text: 'Save',
        onPress: () => {
          leavingAction.current = data.action;
          setSaving(true);
        },
      },
    ]);
  });

  function finish(action?: Parameters<typeof navigation.dispatch>[0] | null) {
    setAllowLeave(true);
    // Navigate on the next tick, after the guard above has been released.
    setTimeout(() => {
      if (action) navigation.dispatch(action);
      else if (router.canGoBack()) router.back();
      else router.replace('/(tabs)/library');
    }, 0);
  }

  function discard(action?: Parameters<typeof navigation.dispatch>[0] | null) {
    takeService.discardDraft(take.id);
    finish(action);
  }

  async function confirmSave() {
    try {
      const { lowSpace } = await saveTakeWithLabel(take.id, label);
      setSaving(false);
      if (lowSpace) Alert.alert('Saved', 'Your phone is running low on space. You can free some by deleting old takes.');
      if (leavingAction.current) finish(leavingAction.current);
    } catch (e) {
      Alert.alert('Couldn’t save', e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <View style={styles.root}>
      {isDraft ? (
        <>
          <Button testID="save-take" label="Save take" onPress={() => setSaving(true)} />
          <Button
            testID="discard-take"
            variant="secondary"
            label="Discard"
            onPress={() =>
              Alert.alert('Discard this take?', 'The recording and its feedback will be deleted.', [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Discard', style: 'destructive', onPress: () => discard() },
              ])
            }
          />
        </>
      ) : take.saved ? (
        <Button testID="edit-take" variant="secondary" label="Rename, relabel, export or delete" onPress={() => router.push(`/take/${take.id}/edit`)} />
      ) : null}

      <Modal visible={saving} animationType="slide" onRequestClose={() => setSaving(false)}>
        <Screen testID="save-sheet">
          <Heading>Save take</Heading>
          <Body muted>Labels group takes so you can track progress on each thing you practise.</Body>
          <LabelPicker value={label} onChange={setLabel} />
          <View style={styles.spacer} />
          <Button testID="save-confirm" label="Save" onPress={confirmSave} />
          <Button
            testID="save-cancel"
            variant="secondary"
            label="Cancel"
            onPress={() => {
              leavingAction.current = null;
              setSaving(false);
            }}
          />
        </Screen>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: spacing.sm },
  spacer: { flexGrow: 1, minHeight: spacing.lg },
});

/**
 * Edit a saved take (tasks.md T075, FR-016, FR-019): rename, relabel, delete, export to the
 * gallery, share.
 */
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { Asset, requestPermissionsAsync } from 'expo-media-library';
import * as Sharing from 'expo-sharing';
import { useState } from 'react';
import { Alert, StyleSheet, TextInput, View } from 'react-native';

import { db } from '@/data/db/client';
import { takeFiles } from '@/data/files';
import { setPracticeItem, updateTitle } from '@/data/repositories/takesRepo';
import { useTakeFeedback } from '@/features/feedback/useTakeFeedback';
import { LabelPicker } from '@/features/library/LabelPicker';
import { resolveLabel, takeService, type LabelChoice } from '@/features/library/takeActions';
import { Body, Button, Heading, Screen } from '@/ui/components/controls';
import { fontSize, radius, spacing, usePalette } from '@/ui/theme';

export default function EditTakeScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { take } = useTakeFeedback(id);
  const p = usePalette();
  const [title, setTitle] = useState<string | null>(null);
  const [label, setLabel] = useState<LabelChoice | undefined>(undefined);
  if (!take) return <Screen>{null}</Screen>;

  const currentLabel: LabelChoice = take.practiceItemId ? { itemId: take.practiceItemId } : null;
  const videoUri = takeFiles.toAbsolute(take.videoPath);

  function saveChanges() {
    try {
      if (title !== null) updateTitle(db, id, title);
      if (label !== undefined) setPracticeItem(db, id, resolveLabel(label));
      router.back();
    } catch (e) {
      Alert.alert('Couldn’t save changes', e instanceof Error ? e.message : String(e));
    }
  }

  async function exportToGallery() {
    const perm = await requestPermissionsAsync(true);
    if (!perm.granted) {
      Alert.alert('Permission needed', 'Allow Rifflect to add videos to your gallery to export this take.');
      return;
    }
    try {
      await Asset.create(videoUri);
      Alert.alert('Exported', 'The video is now in your gallery.');
    } catch (e) {
      Alert.alert('Couldn’t export', e instanceof Error ? e.message : String(e));
    }
  }

  async function share() {
    if (!(await Sharing.isAvailableAsync())) {
      Alert.alert('Sharing isn’t available on this phone');
      return;
    }
    await Sharing.shareAsync(videoUri, { mimeType: 'video/mp4', dialogTitle: 'Share take' });
  }

  return (
    <Screen testID="edit-take-screen">
      <Stack.Screen options={{ title: 'Edit take' }} />
      <Heading>Edit take</Heading>
      <Body>Title</Body>
      <TextInput
        testID="edit-title"
        accessibilityLabel="Title"
        placeholder="Optional title"
        placeholderTextColor={p.textMuted}
        maxLength={80}
        value={title ?? take.title ?? ''}
        onChangeText={setTitle}
        style={[styles.input, { color: p.text, borderColor: p.border, backgroundColor: p.surface }]}
      />
      <LabelPicker value={label === undefined ? currentLabel : label} onChange={setLabel} />
      <Button testID="edit-save" label="Save changes" onPress={saveChanges} />

      <View style={styles.section}>
        <Button testID="export-to-photos" variant="secondary" label="Export video to gallery" onPress={exportToGallery} />
        <Button testID="share-take" variant="secondary" label="Share video" onPress={share} />
      </View>

      <View style={styles.section}>
        <Button
          testID="delete-take"
          variant="danger"
          label="Delete take"
          onPress={() =>
            Alert.alert('Delete this take?', 'The video and its feedback will be removed from this phone.', [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Delete',
                style: 'destructive',
                onPress: () => {
                  takeService.deleteTake(id);
                  router.dismissTo('/(tabs)/library');
                },
              },
            ])
          }
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  input: { borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.md, padding: spacing.md, fontSize: fontSize.body, minHeight: 48 },
  section: { gap: spacing.sm, marginTop: spacing.lg },
});

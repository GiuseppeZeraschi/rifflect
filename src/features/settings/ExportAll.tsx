/**
 * Settings → Backup (tasks.md T076, FR-031): export every saved take (video + readable feedback)
 * to a folder the user picks, with progress. Also shows how much space takes use (FR-017).
 */
import { useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

import { db } from '@/data/db/client';
import { takeFiles } from '@/data/files';
import { exportAll, type ExportProgress } from '@/data/files/exportAll';
import { pickExportTarget } from '@/data/files/expoExportTarget';
import { formatBytes, storageStatus } from '@/data/files/storage';
import { Body, Button } from '@/ui/components/controls';
import { spacing } from '@/ui/theme';

export function ExportAll() {
  const [progress, setProgress] = useState<ExportProgress | null>(null);
  const status = storageStatus(db, takeFiles);

  async function run() {
    const target = await pickExportTarget();
    if (!target) return; // cancelled
    setProgress({ done: 0, total: 0, current: 0 });
    try {
      const r = await exportAll({ db, files: takeFiles, target, onProgress: setProgress });
      if (r.error) {
        Alert.alert(
          'Backup stopped',
          `${r.exported} of ${r.total} takes were exported to “${r.folderName}” before it stopped: ${r.error.message}`,
        );
      } else {
        Alert.alert('Backup complete', `${r.exported} take${r.exported === 1 ? '' : 's'} exported to “${r.folderName}”.`);
      }
    } catch (e) {
      Alert.alert('Backup failed', e instanceof Error ? e.message : String(e));
    } finally {
      setProgress(null);
    }
  }

  return (
    <View style={styles.root}>
      <Body testID="storage-used" muted>
        Takes use {formatBytes(status.takesBytes)}. {formatBytes(status.freeBytes)} free on this phone
        {status.low ? ' (running low)' : ''}.
      </Body>
      <Body muted>
        Your takes only live on this phone. Export them now and then to keep a copy, for example in a folder that syncs to the cloud.
      </Body>
      <Button
        testID="export-all"
        label={progress ? `Exporting ${Math.min(progress.done + 1, progress.total)} of ${progress.total}…` : 'Export all takes'}
        disabled={!!progress}
        onPress={run}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: spacing.sm },
});

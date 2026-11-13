/**
 * Record screen (tasks.md T059, T091; contracts/screens.md): camera preview, accompaniment setting,
 * optional target tempo, and the record button. Stopping goes to the analysing screen.
 *
 * Hand tracking (framing check, landmarks) is added with the native hand-landmarker module; until
 * then takes are analysed from sound only.
 */
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { router, useFocusEffect, useIsFocused, useNavigation } from 'expo-router';
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import {
  Alert,
  AppState,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Camera, useCameraPermission, useMicrophonePermission } from 'react-native-vision-camera';

import { recordingController } from '@/capture';
import { useCameraSession } from '@/capture/cameraSession';
import { StorageFullError } from '@/capture/recordingController';
import { db } from '@/data/db/client';
import type { AccompanimentSetting as Setting } from '@/data/db/schema';
import { takeFiles } from '@/data/files';
import { storageStatus, type StorageStatus } from '@/data/files/storage';
import { useProfile } from '@/features/profile/useProfile';
import { AccompanimentSetting } from '@/features/record/AccompanimentSetting';
import { RecordButton } from '@/features/record/RecordButton';
import { parseTempo } from '@/features/record/tempo';
import { TempoInput } from '@/features/record/TempoInput';
import { Body, Button } from '@/ui/components/controls';
import { fontSize, radius, spacing, usePalette } from '@/ui/theme';

function useRecording() {
  return useSyncExternalStore(recordingController.subscribe, recordingController.getSnapshot);
}

function useAppActive(): boolean {
  const [active, setActive] = useState(AppState.currentState === 'active');
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => setActive(s === 'active'));
    return () => sub.remove();
  }, []);
  return active;
}

export default function RecordScreen() {
  const p = usePalette();
  const camera = useCameraPermission();
  const microphone = useMicrophonePermission();
  const permitted = camera.hasPermission && microphone.hasPermission;

  if (!permitted) {
    const canAsk =
      (!camera.hasPermission && camera.canRequestPermission) ||
      (!microphone.hasPermission && microphone.canRequestPermission);
    const ask = async () => {
      if (!camera.hasPermission && camera.canRequestPermission) await camera.requestPermission();
      if (!microphone.hasPermission && microphone.canRequestPermission)
        await microphone.requestPermission();
    };
    return (
      <View testID="record-screen" style={[styles.center, { backgroundColor: p.background }]}>
        <Text style={[styles.title, { color: p.text }]}>
          Rifflect needs the camera and microphone
        </Text>
        <Body muted>
          It watches your hands and listens to your playing. Everything stays on this phone.
        </Body>
        {canAsk ? (
          <Button
            testID="permission-request"
            label="Allow camera and microphone"
            onPress={() => void ask()}
          />
        ) : (
          <Button
            testID="permission-open-settings"
            label="Open settings"
            onPress={() => void Linking.openSettings()}
          />
        )}
      </View>
    );
  }
  return <Recorder />;
}

function Recorder() {
  const p = usePalette();
  const profile = useProfile();
  const { device, position, videoOutput, constraints } = useCameraSession();
  const rec = useRecording();
  const focused = useIsFocused();
  const appActive = useAppActive();
  const { width, height } = useWindowDimensions();
  const landscape = width > height;
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();

  // Landscape: give the preview the height the header would take.
  useEffect(() => {
    navigation.setOptions({ headerShown: !landscape });
  }, [navigation, landscape]);

  const [accompaniment, setAccompaniment] = useState<Setting>(
    profile?.lastAccompanimentSetting ?? 'auto',
  );
  const [tempoText, setTempoText] = useState('');
  const [storage, setStorage] = useState<StorageStatus | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);

  // Pre-select the last setting once the profile loads.
  const loadedSetting = useRef(false);
  useEffect(() => {
    if (!loadedSetting.current && profile) {
      loadedSetting.current = true;
      setAccompaniment(profile.lastAccompanimentSetting ?? 'auto');
    }
  }, [profile]);

  useFocusEffect(
    useCallback(() => {
      setStorage(storageStatus(db, takeFiles));
    }, []),
  );

  // Keep the screen on while the Record tab is open: the screen locking would stop the take.
  useFocusEffect(
    useCallback(() => {
      activateKeepAwakeAsync('record').catch(() => {});
      return () => {
        void Promise.resolve(deactivateKeepAwake('record')).catch(() => {});
      };
    }, []),
  );

  // Leaving the app mid-take stops the recording; the take is kept as an interrupted take.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'background') void recordingController.interrupt();
    });
    return () => sub.remove();
  }, []);

  // After a take ends (stopped or at the 5:00 limit), go to its analysis.
  const handled = useRef<string | null>(null);
  const finished = rec.lastFinished;
  useEffect(() => {
    if (!finished || handled.current === finished.takeId || !focused || !appActive) return;
    if (finished.interrupted) return; // shown as a notice below
    handled.current = finished.takeId;
    router.push(`/take/${finished.takeId}/analysing`);
  }, [finished, focused, appActive]);

  const tempo = parseTempo(tempoText);
  const recording = rec.state !== 'idle';
  const blocked = storage?.cannotRecord ?? false;

  const start = async () => {
    if (tempo === undefined) return;
    try {
      await recordingController.start({
        cameraPosition: position,
        accompanimentSetting: accompaniment,
        targetTempoBpm: tempo,
      });
    } catch (e) {
      if (e instanceof StorageFullError) setStorage(storageStatus(db, takeFiles));
      else Alert.alert('Recording didn’t start', e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <View
      testID="record-screen"
      style={[styles.root, landscape && styles.row, { backgroundColor: p.background }]}
    >
      <View style={styles.preview}>
        {device ? (
          <Camera
            style={StyleSheet.absoluteFill}
            device={device}
            outputs={[videoOutput]}
            constraints={constraints}
            isActive={(focused && appActive) || recording}
            orientationSource="interface"
            resizeMode="contain"
            onError={(e) => setCameraError(e.message)}
          />
        ) : (
          <View style={styles.center}>
            <Body muted>No {position} camera found. Choose the other camera in Settings.</Body>
          </View>
        )}
        {cameraError && !recording ? (
          <View style={[styles.overlay, { backgroundColor: p.surface }]}>
            <Body>Camera problem: {cameraError}</Body>
          </View>
        ) : null}
      </View>

      <ScrollView
        style={[
          landscape ? styles.sidePanel : styles.bottomPanel,
          { backgroundColor: p.background },
        ]}
        contentContainerStyle={[
          styles.panel,
          landscape && styles.panelFill,
          landscape && {
            paddingTop: insets.top,
            paddingBottom: spacing.sm,
            paddingRight: insets.right + spacing.lg,
            gap: spacing.sm,
          },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        {finished?.interrupted && !recording ? (
          <View testID="interrupted-notice" style={[styles.notice, { backgroundColor: p.surface }]}>
            <Body>
              Recording stopped when Rifflect left the screen. The recorded part was kept.
            </Body>
            <Button
              variant="secondary"
              label={finished.analysisStatus === 'too_short' ? 'Open take' : 'See feedback'}
              onPress={() => {
                handled.current = finished.takeId;
                router.push(`/take/${finished.takeId}/analysing`);
              }}
            />
          </View>
        ) : null}

        {storage?.cannotRecord ? (
          <Text testID="storage-warning" style={[styles.warning, { color: p.danger }]}>
            Your phone is almost full. Free up space or delete old takes before recording.
          </Text>
        ) : storage?.low ? (
          <Text testID="storage-warning" style={[styles.warning, { color: p.warning }]}>
            Storage is running low. You have room for only a few more takes.
          </Text>
        ) : null}

        {!recording ? (
          <>
            <AccompanimentSetting value={accompaniment} onChange={setAccompaniment} />
            <TempoInput value={tempoText} onChange={setTempoText} />
            {landscape ? null : (
              <Text style={{ color: p.textMuted, fontSize: fontSize.caption }}>
                Frame both hands and the guitar neck. Hand tracking arrives in a later build; for
                now, feedback is on timing.
              </Text>
            )}
          </>
        ) : (
          <Text style={{ color: p.textMuted, fontSize: fontSize.body, textAlign: 'center' }}>
            {accompaniment === 'off'
              ? 'Recording'
              : 'Recording – play over your loop or track as usual'}
          </Text>
        )}

        <RecordButton
          state={rec.state}
          startedAt={rec.startedAt}
          disabled={!recording && (blocked || tempo === undefined || !device)}
          onStart={() => void start()}
          onStop={() => void recordingController.stop()}
        />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  row: { flexDirection: 'row' },
  preview: { flex: 1, backgroundColor: '#000' },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    gap: spacing.lg,
  },
  title: { fontSize: fontSize.title, fontWeight: '600', textAlign: 'center' },
  overlay: {
    position: 'absolute',
    left: spacing.md,
    right: spacing.md,
    bottom: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
  },
  bottomPanel: { flexGrow: 0, maxHeight: '55%' },
  sidePanel: { flexGrow: 0, width: 360 },
  panel: { padding: spacing.lg, gap: spacing.md },
  panelFill: { flexGrow: 1, justifyContent: 'center' },
  notice: { borderRadius: radius.md, padding: spacing.md, gap: spacing.sm },
  warning: { fontSize: fontSize.caption, fontWeight: '600' },
});

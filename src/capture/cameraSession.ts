/**
 * Camera session for the Record screen (tasks.md T056): the camera from the profile (front by
 * default), a 1080p video output with audio, and 30 fps.
 *
 * Mirroring stays on VisionCamera's default (`auto`: front camera mirrored, like a selfie).
 * `mirrorMode: 'off'` turns the front-camera preview upside down in landscape on Android
 * (VisionCamera 5.2.4), so front-camera takes are recorded mirrored and analysed with
 * landmarksMirrored = true (src/jobs/runAnalysis.ts).
 */
import { useEffect, useMemo } from 'react';
import { CommonResolutions, useCameraDevice, useVideoOutput, type CameraVideoOutput, type Constraint } from 'react-native-vision-camera';

import type { CameraPosition } from '@/data/db/schema';
import { useProfile } from '@/features/profile/useProfile';
import { RECORD_FPS } from './config';
import type { RecorderHandle } from './recordingController';

let attachedOutput: CameraVideoOutput | null = null;

/** The recording controller's recorder factory: records with whichever video output is on screen. */
export async function createVisionRecorder(filePath: string, maxDurationSec: number): Promise<RecorderHandle> {
  if (!attachedOutput) throw new Error('The camera isn’t ready yet');
  const recorder = await attachedOutput.createRecorder({ filePath, maxDuration: maxDurationSec });
  return {
    start: (onFinished, onError) => recorder.startRecording(() => onFinished(), onError),
    stop: () => recorder.stopRecording(),
  };
}

export function useCameraSession() {
  const profile = useProfile();
  const position: CameraPosition = profile?.preferredCamera ?? 'front';
  const device = useCameraDevice(position);
  const videoOutput = useVideoOutput({ targetResolution: CommonResolutions.FHD_16_9, enableAudio: true });
  const constraints = useMemo<Constraint[]>(() => [{ fps: RECORD_FPS }], []);

  useEffect(() => {
    attachedOutput = videoOutput;
    return () => {
      if (attachedOutput === videoOutput) attachedOutput = null;
    };
  }, [videoOutput]);

  return { device, position, videoOutput, constraints };
}

/**
 * Typed wrapper around the hand-landmarker native module (contracts/native-modules.md § 1).
 * Post-take extraction (tasks.md T021): runs MediaPipe Hand Landmarker over a recorded video and
 * writes landmarks.jsonl. Live detection during recording is a later step.
 */
import Native, { type ExtractResult } from '../../modules/rifflect-hand-landmarker/src';

export type { ExtractResult };

/**
 * Extract hand landmarks from `videoUri` at `fps` into `outUri` (both file:// URIs).
 * `onProgress` receives 0..1 as the video is processed.
 */
export async function extractLandmarksFromVideo(
  videoUri: string,
  outUri: string,
  fps: number,
  onProgress?: (fraction: number) => void,
): Promise<ExtractResult> {
  const sub = onProgress
    ? Native.addListener('onProgress', (e) => {
        if (e.videoUri === videoUri) onProgress(e.progress);
      })
    : null;
  try {
    return await Native.extractLandmarksFromVideo(videoUri, outUri, fps);
  } finally {
    sub?.remove();
  }
}

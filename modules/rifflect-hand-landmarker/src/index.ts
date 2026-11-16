/**
 * JS binding for the RifflectHandLandmarker native module (contracts/native-modules.md § 1).
 * App code uses the typed wrapper in src/native/handLandmarker.ts, not this file directly.
 */
import { NativeModule, requireNativeModule } from 'expo';

export interface ExtractResult {
  /** file:// URI of the written landmarks.jsonl. */
  path: string;
  /** Sampled frames written. */
  frames: number;
  /** Of those, frames where at least one hand was found. */
  framesWithHands: number;
}

export const HAND_LANDMARKER_ERRORS = [
  'E_FILE_NOT_FOUND',
  'E_NO_VIDEO_TRACK',
  'E_EXTRACT_FAILED',
  'E_NO_CONTEXT',
] as const;

type Events = {
  onProgress(e: { videoUri: string; progress: number }): void;
};

declare class RifflectHandLandmarkerModule extends NativeModule<Events> {
  extractLandmarksFromVideo(videoUri: string, outUri: string, fps: number): Promise<ExtractResult>;
}

export default requireNativeModule<RifflectHandLandmarkerModule>('RifflectHandLandmarker');

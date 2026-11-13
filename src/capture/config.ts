/** Capture constants (tasks.md T056, T058). */
import { MAX_TAKE_MS } from '@/data/repositories/takesRepo';

/** Recording frame rate. */
export const RECORD_FPS = 30;
/** Hand-landmark detection rate (one constant; no device tiering in v1). */
export const LANDMARK_FPS = 12;
/** Recording stops automatically at this length. */
export const MAX_RECORDING_MS = MAX_TAKE_MS;

/** Filesystem path for a `file://` URI (VisionCamera's Recorder wants a path, not a URL). */
export function uriToPath(uri: string): string {
  return decodeURIComponent(uri.replace(/^file:\/\//, ''));
}

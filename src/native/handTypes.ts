/** Result of one HandLandmarker.detect(frame) call (contracts/native-modules.md § 1). */
import type { HandObservation } from '@/analysis/types';

export interface HandsResult {
  /** Frame presentation time on the recording clock (ms). */
  tMs: number;
  hands: HandObservation[];
  /** 0..1 mean luma. */
  brightness: number;
}

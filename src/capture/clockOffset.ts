/**
 * Offset (ms) added to landmark timestamps so they line up with the decoded audio clock.
 * Measured by spike T026 (clap test) on the Nothing Phone (4a); 0 until measured.
 * Keyed by platform so iOS can add its own value later.
 */
import { Platform } from 'react-native';

const OFFSETS: Partial<Record<typeof Platform.OS, number>> = {
  android: 0,
};

export const CLOCK_OFFSET_MS = OFFSETS[Platform.OS] ?? 0;

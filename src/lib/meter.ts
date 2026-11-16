import type { TimeSignature } from '@/data/db/schema';

/** Beats per bar for each time signature (6/8 is counted in six eighth-note beats). */
export const BEATS_PER_BAR: Record<TimeSignature, number> = { '4/4': 4, '3/4': 3, '6/8': 6 };

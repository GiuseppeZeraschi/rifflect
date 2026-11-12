/**
 * Framing check before and during recording (tasks.md T057, FR-002, Story 1 scenario 4).
 * Pure: takes the last ~30 hand-tracking results and says whether the phone is placed well.
 * The camera wiring (frame-output worklet → this check) lives with the Record screen.
 */
import { FRAMING, TECHNIQUE } from '@/analysis/config/thresholds';
import type { Handedness, Point3 } from '@/analysis/types';
import type { HandsResult } from '@/native/handTypes';

export type FramingStatus = 'ok' | 'hands_missing' | 'fretting_out_of_frame' | 'low_light';

export interface FramingResult {
  status: FramingStatus;
  hint: string;
}

export const FRAMING_HINTS: Record<FramingStatus, string> = {
  ok: 'Looks good: both hands are in view.',
  hands_missing: 'Make sure both hands and the guitar neck are in view. Try moving the phone back a little.',
  fretting_out_of_frame: 'Your fretting hand is near the edge. Move the phone so the whole neck hand is in view.',
  low_light: 'It’s too dark to see your hands. Turn on a light or face a window.',
};

const flip = (s: 'Left' | 'Right') => (s === 'Left' ? 'Right' : 'Left');

function frettingHand(r: HandsResult, handedness: Handedness, mirrored: boolean): Point3[] | null {
  const want: 'Left' | 'Right' = handedness === 'right' ? 'Left' : 'Right';
  const h = r.hands.find((x) => x.score >= TECHNIQUE.minHandScore && (mirrored ? x.side : flip(x.side)) === want);
  return h?.pts ?? null;
}

const inFrame = (pts: Point3[]) =>
  pts.every(([x, y]) => x >= FRAMING.frameMargin && x <= 1 - FRAMING.frameMargin && y >= FRAMING.frameMargin && y <= 1 - FRAMING.frameMargin);

export function framingStatus(
  window: HandsResult[],
  { handedness, mirrored }: { handedness: Handedness; mirrored: boolean },
): FramingResult {
  const make = (status: FramingStatus): FramingResult => ({ status, hint: FRAMING_HINTS[status] });
  if (window.length === 0) return make('hands_missing');

  const brightness = window.reduce((s, r) => s + r.brightness, 0) / window.length;
  if (brightness < FRAMING.lowLightBrightness) return make('low_light');

  const bothVisible = window.filter((r) => r.hands.filter((h) => h.score >= TECHNIQUE.minHandScore).length >= 2).length;
  if (bothVisible / window.length < FRAMING.bothHandsFraction) return make('hands_missing');

  const fretting = window.map((r) => frettingHand(r, handedness, mirrored)).filter((p): p is Point3[] => p !== null);
  const inside = fretting.filter(inFrame).length;
  if (fretting.length === 0 || inside / fretting.length < FRAMING.bothHandsFraction) return make('fretting_out_of_frame');

  return make('ok');
}

/** Fixed-size ring of the latest hand results, for live framing checks. */
export class FramingWindow {
  private items: HandsResult[] = [];
  constructor(private readonly capacity = FRAMING.windowFrames) {}
  push(r: HandsResult) {
    this.items.push(r);
    if (this.items.length > this.capacity) this.items.shift();
  }
  clear() {
    this.items = [];
  }
  get size() {
    return this.items.length;
  }
  status(opts: { handedness: Handedness; mirrored: boolean }): FramingResult {
    return framingStatus(this.items, opts);
  }
}

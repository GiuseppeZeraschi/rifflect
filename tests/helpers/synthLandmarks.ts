/**
 * Synthetic MediaPipe-style hand landmark streams (tasks.md T030).
 *
 * Landmark indices (MediaPipe): 0 wrist; thumb 1 CMC, 2 MCP, 3 IP, 4 TIP; index 5 MCP, 6 PIP,
 * 7 DIP, 8 TIP; middle 9–12; ring 13–16; pinky 17–20.
 *
 * Conventions shared with src/analysis/technique (see hands.ts):
 * - Coordinates are normalised (0..1), y grows downwards, frames are un-mirrored (the player is seen
 *   as by someone facing them).
 * - MediaPipe assumes selfie (mirrored) input, so on un-mirrored frames its `side` label is the
 *   OPPOSITE of the true hand. `mirrored: true` simulates frames that were left mirrored (x → 1−x,
 *   labels then correct).
 * - A right-handed player's fretting (left) hand appears on the image's right; for left-handed
 *   players, on the left.
 */
import type { HandObservation, LandmarkFrame, Point3 } from '@/analysis/types';

export interface HandPose {
  /** Wrist position (normalised image coords). */
  wrist: [number, number];
  /** Hand length = wrist → middle MCP distance. */
  scale?: number;
  /** In-plane rotation of the whole hand (degrees, 0 = fingers point up). Used for wrist angle. */
  rotationDeg?: number;
  /** Angle at each PIP joint (degrees, 180 = straight). Same for all four fingers unless an array. */
  pipDeg?: number | [number, number, number, number];
  /** Thumb tip vertical offset from the index MCP, in hand lengths (negative = above it). */
  thumbTipDy?: number;
  /** Extra fingertip lift away from the fretboard, in hand lengths (moves tips up and toward the camera). */
  fingerLift?: number;
}

const FINGER_MCP_X = [-0.3, -0.1, 0.1, 0.28]; // index, middle, ring, pinky (hand lengths)
const SEG = [0.45, 0.28, 0.22]; // proximal, middle, distal phalanx lengths (hand lengths)

function rotate([x, y]: [number, number], deg: number): [number, number] {
  const r = (deg * Math.PI) / 180;
  return [x * Math.cos(r) - y * Math.sin(r), x * Math.sin(r) + y * Math.cos(r)];
}

/** Build 21 landmarks for a hand pose. `trueSide` decides which way the thumb points. */
export function handPoints(pose: HandPose, trueSide: 'Left' | 'Right'): Point3[] {
  const s = pose.scale ?? 0.12;
  const rot = pose.rotationDeg ?? 0;
  const lift = pose.fingerLift ?? 0;
  const pips = Array.isArray(pose.pipDeg) ? pose.pipDeg : new Array(4).fill(pose.pipDeg ?? 120);
  // On an un-mirrored frontal view, a left hand's thumb points to image left (−x) when fingers point up.
  const thumbDir = trueSide === 'Left' ? -1 : 1;

  // Hand-local coords: wrist at origin, fingers along −y, units of hand length; z toward camera.
  const local: Point3[] = new Array(21);
  local[0] = [0, 0, 0];
  // Thumb: CMC → TIP sweeping sideways, tip vertical offset controlled by thumbTipDy.
  const thumbTipY = -1 + (pose.thumbTipDy ?? 0.25);
  local[1] = [thumbDir * 0.2, -0.2, 0];
  local[2] = [thumbDir * 0.38, -0.42, 0];
  local[3] = [thumbDir * 0.5, (-0.42 + thumbTipY) / 2, 0];
  local[4] = [thumbDir * 0.55, thumbTipY, 0];
  for (let f = 0; f < 4; f++) {
    const mcp: Point3 = [FINGER_MCP_X[f]! * thumbDir * -1, -1, 0];
    const bend = 180 - pips[f]!; // degrees of flexion at the PIP
    // Proximal phalanx straight up; middle/distal curl toward the fretboard (+z away, +y down).
    const pip: Point3 = [mcp[0], mcp[1] - SEG[0]!, 0];
    const a1 = (bend * Math.PI) / 180;
    const dip: Point3 = [pip[0], pip[1] - SEG[1]! * Math.cos(a1), -SEG[1]! * Math.sin(a1)];
    const a2 = a1 * 1.6; // DIP flexes with the PIP
    const tip: Point3 = [dip[0], dip[1] - SEG[2]! * Math.cos(a2), dip[2] - SEG[2]! * Math.sin(a2)];
    tip[1] -= lift;
    tip[2] += lift;
    dip[1] -= lift * 0.5;
    dip[2] += lift * 0.5;
    local[5 + f * 4] = mcp;
    local[6 + f * 4] = pip;
    local[7 + f * 4] = dip;
    local[8 + f * 4] = tip;
  }
  return local.map(([x, y, z]) => {
    const [rx, ry] = rotate([x * s, y * s], rot);
    return [pose.wrist[0] + rx, pose.wrist[1] + ry, z * s] as Point3;
  });
}

export interface StreamOptions {
  durationMs: number;
  fps?: number;
  handedness?: 'right' | 'left';
  /** Simulate frames left mirrored (x → 1−x, MediaPipe labels then correct). */
  mirrored?: boolean;
  /** Fretting-hand pose over time (null = not visible). */
  fretting?: (tMs: number) => HandPose | null;
  /** Picking-hand pose over time (null = not visible). */
  picking?: (tMs: number) => HandPose | null;
  /** Time ranges (ms) where both hands are missing. */
  missing?: [number, number][];
  /** Hand detection score. */
  score?: number;
  brightness?: number;
}

export const DEFAULT_FRETTING: HandPose = { wrist: [0.68, 0.62], pipDeg: 110, thumbTipDy: 0.3 };
export const DEFAULT_PICKING: HandPose = { wrist: [0.3, 0.6], pipDeg: 150 };

export function landmarkStream(opts: StreamOptions): LandmarkFrame[] {
  const fps = opts.fps ?? 12;
  const handed = opts.handedness ?? 'right';
  const frettingTrue: 'Left' | 'Right' = handed === 'right' ? 'Left' : 'Right';
  const pickingTrue: 'Left' | 'Right' = handed === 'right' ? 'Right' : 'Left';
  const frames: LandmarkFrame[] = [];
  const step = 1000 / fps;
  for (let t = 0; t < opts.durationMs; t += step) {
    const tMs = Math.round(t);
    const isMissing = (opts.missing ?? []).some(([a, b]) => tMs >= a && tMs < b);
    const hands: HandObservation[] = [];
    if (!isMissing) {
      const add = (pose: HandPose | null, trueSide: 'Left' | 'Right') => {
        if (!pose) return;
        // Left-handed players mirror the whole layout (fretting hand on image left).
        const p: HandPose =
          handed === 'left' ? { ...pose, wrist: [1 - pose.wrist[0], pose.wrist[1]], rotationDeg: -(pose.rotationDeg ?? 0) } : pose;
        let pts = handPoints(p, trueSide);
        // MediaPipe label on un-mirrored frames = opposite of the true side.
        let side: 'Left' | 'Right' = trueSide === 'Left' ? 'Right' : 'Left';
        if (opts.mirrored) {
          pts = pts.map(([x, y, z]) => [1 - x, y, z] as Point3);
          side = trueSide;
        }
        hands.push({ side, score: opts.score ?? 0.95, pts });
      };
      add(opts.fretting ? opts.fretting(tMs) : DEFAULT_FRETTING, frettingTrue);
      add(opts.picking ? opts.picking(tMs) : DEFAULT_PICKING, pickingTrue);
    }
    frames.push({ tMs, hands, brightness: opts.brightness ?? 0.5 });
  }
  return frames;
}

/**
 * Picking-hand pose whose wrist strums up and down: each stroke moves the wrist between `top` and
 * `bottom` (normalised y), centred on the stroke time, alternating down/up strokes. Between strokes
 * the hand keeps moving smoothly unless `holdBetween` is true.
 */
export function strummingHand(
  strokeTimesMs: number[],
  { top = 0.5, bottom = 0.7, strokeMs = 120, x = 0.3, amplitudes }: { top?: number; bottom?: number; strokeMs?: number; x?: number; amplitudes?: number[] } = {},
): (tMs: number) => HandPose {
  return (tMs: number) => {
    // Find the stroke whose window contains t, or the last completed stroke.
    let y = top;
    for (let i = 0; i < strokeTimesMs.length; i++) {
      const c = strokeTimesMs[i]!;
      const amp = amplitudes?.[i] ?? 1;
      const lo = top + ((bottom - top) * (1 - amp)) / 2;
      const hi = bottom - ((bottom - top) * (1 - amp)) / 2;
      const down = i % 2 === 0;
      const from = down ? lo : hi;
      const to = down ? hi : lo;
      const u = (tMs - (c - strokeMs / 2)) / strokeMs;
      if (u < 0) break;
      y = u >= 1 ? to : from + (to - from) * (0.5 - 0.5 * Math.cos(Math.PI * u));
    }
    return { ...DEFAULT_PICKING, wrist: [x, y] };
  };
}

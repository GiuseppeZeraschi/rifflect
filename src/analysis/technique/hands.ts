/**
 * Hand roles, smoothing and coverage (tasks.md T045, contract guarantee 5).
 *
 * MediaPipe labels handedness as if the image were a mirrored selfie. Our frames are un-mirrored by
 * default, so its label is the opposite of the true hand; when `mirrored` is true the label is used
 * as-is. A right-handed player frets with the true left hand; a left-handed player with the right.
 */
import { FRAMING, TECHNIQUE } from '../config/thresholds';
import type { Handedness, LandmarkFrame, Point3 } from '../types';

export type Range = [number, number];

export interface HandTracks {
  tMs: number[];
  /** Smoothed fretting-hand landmarks per frame, or null when not visible. */
  fretting: (Point3[] | null)[];
  picking: (Point3[] | null)[];
  brightness: (number | undefined)[];
  coverage: { fretting: number; picking: number };
  /** Ranges (≥ 1 s) where neither hand was visible. */
  missingBoth: Range[];
  /** Ranges (≥ 1 s) where the fretting hand was partly outside the frame. */
  frettingOutOfFrame: Range[];
  /** Median time between frames (ms). */
  frameMs: number;
}

const flip = (s: 'Left' | 'Right') => (s === 'Left' ? 'Right' : 'Left');
const MIN_RANGE_MS = 1000;
const SMOOTH_RESET_MS = 300;

function smooth(track: (Point3[] | null)[], tMs: number[]): (Point3[] | null)[] {
  const a = TECHNIQUE.smoothingAlpha;
  let prev: Point3[] | null = null;
  let prevT = -Infinity;
  return track.map((pts, i) => {
    if (!pts) {
      prev = null;
      return null;
    }
    if (!prev || tMs[i]! - prevT > SMOOTH_RESET_MS) {
      prev = pts.map((p) => [...p] as Point3);
    } else {
      const last: Point3[] = prev;
      prev = pts.map((p, j) => [
        a * p[0] + (1 - a) * last[j]![0],
        a * p[1] + (1 - a) * last[j]![1],
        a * p[2] + (1 - a) * last[j]![2],
      ]);
    }
    prevT = tMs[i]!;
    return prev;
  });
}

/** Merge consecutive frames matching `cond` into time ranges at least MIN_RANGE_MS long. */
export function rangesWhere(tMs: number[], frameMs: number, cond: (i: number) => boolean): Range[] {
  const out: Range[] = [];
  let start: number | null = null;
  for (let i = 0; i <= tMs.length; i++) {
    const on = i < tMs.length && cond(i);
    if (on && start === null) start = tMs[i]!;
    if (!on && start !== null) {
      const end = i < tMs.length ? tMs[i]! : tMs[tMs.length - 1]! + frameMs;
      if (end - start >= MIN_RANGE_MS) out.push([start, end]);
      start = null;
    }
  }
  return out;
}

function outOfFrame(pts: Point3[]): boolean {
  const m = FRAMING.frameMargin;
  return pts.some(([x, y]) => x < m || x > 1 - m || y < m || y > 1 - m);
}

export function assignHands(frames: LandmarkFrame[], opts: { handedness: Handedness; mirrored: boolean }): HandTracks {
  const frettingSide: 'Left' | 'Right' = opts.handedness === 'right' ? 'Left' : 'Right';
  const tMs = frames.map((f) => f.tMs);
  const rawFretting: (Point3[] | null)[] = [];
  const rawPicking: (Point3[] | null)[] = [];
  for (const f of frames) {
    let fret: { pts: Point3[]; score: number } | null = null;
    let pick: { pts: Point3[]; score: number } | null = null;
    for (const h of f.hands) {
      if (h.score < TECHNIQUE.minHandScore || h.pts.length !== 21) continue;
      const trueSide = opts.mirrored ? h.side : flip(h.side);
      if (trueSide === frettingSide) {
        if (!fret || h.score > fret.score) fret = { pts: h.pts, score: h.score };
      } else if (!pick || h.score > pick.score) {
        pick = { pts: h.pts, score: h.score };
      }
    }
    rawFretting.push(fret?.pts ?? null);
    rawPicking.push(pick?.pts ?? null);
  }
  const gaps = tMs.slice(1).map((t, i) => t - tMs[i]!).sort((a, b) => a - b);
  const frameMs = gaps.length ? gaps[gaps.length >> 1]! : 1000 / 12;
  const n = Math.max(1, frames.length);
  return {
    tMs,
    fretting: smooth(rawFretting, tMs),
    picking: smooth(rawPicking, tMs),
    brightness: frames.map((f) => f.brightness),
    coverage: {
      fretting: rawFretting.filter(Boolean).length / n,
      picking: rawPicking.filter(Boolean).length / n,
    },
    missingBoth: rangesWhere(tMs, frameMs, (i) => !rawFretting[i] && !rawPicking[i]),
    frettingOutOfFrame: rangesWhere(tMs, frameMs, (i) => !!rawFretting[i] && outOfFrame(rawFretting[i]!)),
    frameMs,
  };
}

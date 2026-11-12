/** Small vector helpers for MediaPipe landmarks (normalised image coords, y down). */
import type { Point3 } from '../types';

export const WRIST = 0;
export const THUMB_TIP = 4;
export const INDEX_MCP = 5;
export const MIDDLE_MCP = 9;
/** [MCP, PIP, DIP, TIP] indices for index, middle, ring, pinky. */
export const FINGERS = [
  [5, 6, 7, 8],
  [9, 10, 11, 12],
  [13, 14, 15, 16],
  [17, 18, 19, 20],
] as const;

export const sub = (a: Point3, b: Point3): Point3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const dot = (a: Point3, b: Point3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const len = (a: Point3) => Math.sqrt(dot(a, a));
export const len2 = (a: Point3) => Math.hypot(a[0], a[1]);

/** Angle (degrees) at `b` between b→a and b→c, in 3D. */
export function angleAt(a: Point3, b: Point3, c: Point3): number {
  const u = sub(a, b);
  const v = sub(c, b);
  const d = len(u) * len(v);
  if (d === 0) return 180;
  return (Math.acos(Math.max(-1, Math.min(1, dot(u, v) / d))) * 180) / Math.PI;
}

/** Wrist → middle-MCP length in the image plane (scale reference for a hand). */
export function handLength(pts: Point3[]): number {
  return len2(sub(pts[MIDDLE_MCP]!, pts[WRIST]!));
}

/** Unit vector along the hand (wrist → middle MCP) in the image plane. */
export function handAxis(pts: Point3[]): [number, number] {
  const v = sub(pts[MIDDLE_MCP]!, pts[WRIST]!);
  const l = Math.hypot(v[0], v[1]) || 1;
  return [v[0] / l, v[1] / l];
}

/** Projection of (p − origin) onto the hand axis, in hand lengths. */
export function alongHand(pts: Point3[], p: Point3, origin: Point3): number {
  const [ux, uy] = handAxis(pts);
  const d = sub(p, origin);
  return (d[0] * ux + d[1] * uy) / (handLength(pts) || 1);
}

/** Hand orientation (degrees from "fingers pointing straight up" in the image), signed. */
export function handAngleDeg(pts: Point3[]): number {
  const [ux, uy] = handAxis(pts);
  return (Math.atan2(ux, -uy) * 180) / Math.PI;
}

export function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  const i = Math.min(s.length - 1, Math.max(0, Math.round((p / 100) * (s.length - 1))));
  return s[i]!;
}

export const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / Math.max(1, xs.length);
export function cv(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  if (m === 0) return 0;
  const sd = Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1));
  return sd / Math.abs(m);
}

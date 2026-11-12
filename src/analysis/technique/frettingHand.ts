/**
 * Fretting-hand analyser (tasks.md T046, research.md R7). All measures are in the hand's own frame
 * (relative to the wrist → middle-MCP axis), so they don't depend on where the hand is in the image.
 */
import { TECHNIQUE } from '../config/thresholds';
import type { Finding, Point3 } from '../types';
import {
  alongHand,
  angleAt,
  FINGERS,
  handAngleDeg,
  INDEX_MCP,
  mean,
  percentile,
  THUMB_TIP,
} from './geometry';
import { rangesWhere, type HandTracks } from './hands';

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

function visibilityConfidence(visibleFrames: number, coverage: number): number {
  return clamp(0.45 + 0.45 * coverage, 0, 0.9) * clamp(visibleFrames / 36, 0.5, 1);
}

export function analyseFretting(tracks: HandTracks): Finding[] {
  const visible: { t: number; pts: Point3[]; i: number }[] = [];
  tracks.fretting.forEach((pts, i) => pts && visible.push({ t: tracks.tMs[i]!, pts, i }));
  if (visible.length < 12) return [];
  const conf = visibilityConfidence(visible.length, tracks.coverage.fretting);
  const first = visible[0]!.t;
  const last = visible[visible.length - 1]!.t;
  const out: Finding[] = [];

  // Fingertip positions along the hand axis, per finger (for lift and shape stability).
  const tipAlong = FINGERS.map(([mcp, , , tip]) => visible.map(({ pts }) => alongHand(pts, pts[tip]!, pts[mcp]!)));
  const tipRange = tipAlong.map((v) => percentile(v, 95) - percentile(v, 5));
  const stableShape = Math.max(...tipRange) < 0.12;

  // Thumb over the neck: thumb tip beyond the index MCP along the hand axis for most of the take.
  const thumbAlong = visible.map(({ pts }) => alongHand(pts, pts[THUMB_TIP]!, pts[INDEX_MCP]!));
  const overFraction = thumbAlong.filter((d) => d > 0.05).length / visible.length;
  if (overFraction >= TECHNIQUE.thumbOverNeckFraction) {
    out.push({
      category: 'technique',
      aspect: 'fretting_hand',
      issueCode: 'technique.fret_thumb_over_neck',
      // Thumb-over is normal for many chord shapes; informational when the hand holds stable shapes.
      severity: stableShape ? 'info' : 'minor',
      confidence: conf,
      startMs: Math.round(first),
      endMs: Math.round(last),
      metrics: { fractionPct: Math.round(overFraction * 100), chordLike: stableShape ? 'yes' : 'no' },
    });
  }

  // Flat fingers: mean PIP angle close to straight.
  const pipMeans = visible.map(({ pts }) => mean(FINGERS.map(([m, p, d]) => angleAt(pts[m]!, pts[p]!, pts[d]!))));
  const flatFraction = pipMeans.filter((a) => a > TECHNIQUE.flatFingerPipDeg).length / visible.length;
  if (flatFraction >= 0.5) {
    out.push({
      category: 'technique',
      aspect: 'fretting_hand',
      issueCode: 'technique.flat_fingers',
      severity: flatFraction >= 0.8 ? 'moderate' : 'minor',
      confidence: conf,
      startMs: Math.round(first),
      endMs: Math.round(last),
      metrics: { fractionPct: Math.round(flatFraction * 100), meanPipDeg: Math.round(mean(pipMeans)) },
    });
  }

  // Fingers lifting high: a fingertip's travel along the hand axis between notes.
  const maxLift = Math.max(...tipRange);
  if (maxLift > TECHNIQUE.fingerLiftHandFraction) {
    const finger = ['index', 'middle', 'ring', 'pinky'][tipRange.indexOf(maxLift)]!;
    out.push({
      category: 'technique',
      aspect: 'fretting_hand',
      issueCode: 'technique.fingers_lifting_high',
      severity: maxLift > 0.6 ? 'moderate' : 'minor',
      confidence: conf,
      startMs: Math.round(first),
      endMs: Math.round(last),
      metrics: { finger, liftPctOfHand: Math.round(maxLift * 100) },
    });
  }

  // Wrist strain: hand angle beyond the extreme, held continuously for longer than the hold time.
  const extreme = (i: number) => {
    const pts = tracks.fretting[i];
    return !!pts && Math.abs(handAngleDeg(pts)) > TECHNIQUE.wristExtremeDeg;
  };
  const held = rangesWhere(tracks.tMs, tracks.frameMs, extreme).filter(([a, b]) => b - a > TECHNIQUE.wristStrainHoldMs);
  if (held.length > 0) {
    const longest = held.reduce((x, y) => (y[1] - y[0] > x[1] - x[0] ? y : x));
    out.push({
      category: 'technique',
      aspect: 'fretting_hand',
      issueCode: 'technique.wrist_strain',
      severity: longest[1] - longest[0] > 15_000 ? 'moderate' : 'minor',
      confidence: Math.min(conf, 0.75),
      startMs: Math.round(longest[0]),
      endMs: Math.round(longest[1]),
      metrics: { heldSeconds: Math.round((longest[1] - longest[0]) / 1000), occurrences: held.length },
    });
  }
  return out;
}

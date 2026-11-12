/**
 * Which onsets are the player's live notes? (tasks.md T087, research.md R16)
 *
 * Onsets come from the live residual. Each is matched to the picking hand's strokes (±50 ms):
 * - matched → high confidence (0.9);
 * - unmatched but clearly in the residual (probably legato: hammer-on, pull-off, tap) → medium;
 * - unmatched and weak → dropped (leakage from the accompaniment).
 * Without hand tracking, confidence comes from the residual's strength alone.
 */
import { ACCOMPANIMENT, AUDIO } from '../config/thresholds';
import type { HandTracks } from '../technique/hands';
import { detectStrokes, type Stroke } from '../technique/pickingHand';
import type { SeparationConfidence } from '../types';

export interface Attribution {
  /** Live onsets kept, with their confidence (0..1). */
  onsetsMs: number[];
  confidence: number[];
  /** Matched / kept, when stroke data exists. */
  matchRate: number | null;
  separation: SeparationConfidence;
  tooLoud: boolean;
  /** Picking strokes seen (0 without hand tracking). */
  strokeCount: number;
}

const SR = AUDIO.sampleRate;

function energy(x: Float32Array, fromMs: number, toMs: number): number {
  const a = Math.max(0, Math.round((fromMs / 1000) * SR));
  const b = Math.min(x.length, Math.round((toMs / 1000) * SR));
  let e = 0;
  for (let i = a; i < b; i++) e += x[i]! * x[i]!;
  return e;
}

export function attributeOnsets({
  residualOnsetsMs,
  residual,
  mix,
  liveShare,
  tracks,
}: {
  residualOnsetsMs: number[];
  residual: Float32Array;
  mix: Float32Array;
  /** Share of the mix's energy in the residual (1 when there was no separation). */
  liveShare: number;
  tracks: HandTracks | null;
}): Attribution {
  const strokes: Stroke[] = tracks ? detectStrokes(tracks) : [];
  const haveStrokes = strokes.length >= 4;
  const onsetsMs: number[] = [];
  const confidence: number[] = [];
  let matched = 0;
  for (const t of residualOnsetsMs) {
    const ratio = energy(residual, t, t + 50) / (energy(mix, t, t + 50) || 1e-12);
    const hit = haveStrokes && strokes.some((s) => Math.abs(s.tMs - t) <= ACCOMPANIMENT.strokeMatchMs);
    let c: number;
    if (hit) {
      c = 0.9;
      matched++;
    } else if (haveStrokes) {
      c = ratio >= 0.5 ? 0.65 : 0;
    } else {
      c = ratio >= 0.6 ? 0.75 : ratio >= 0.4 ? 0.6 : 0;
    }
    if (c > 0) {
      onsetsMs.push(t);
      confidence.push(c);
    }
  }
  const matchRate = haveStrokes && onsetsMs.length > 0 ? matched / onsetsMs.length : null;

  // liveShare = residual energy / mix energy. REPET's soft mask also trims the lead where it overlaps
  // the loop, so this reads well below the true lead share (≈0.11 for an equally loud loop).
  const tooLoud = liveShare < ACCOMPANIMENT.tooLoudShare;
  let separation: SeparationConfidence;
  if (liveShare >= ACCOMPANIMENT.goodShare && (matchRate ?? 0) >= 0.6) separation = 'good';
  else if (liveShare >= ACCOMPANIMENT.partialShare || (liveShare >= ACCOMPANIMENT.tooLoudShare * 0.66 && (matchRate ?? 0) >= 0.5)) separation = 'partial';
  else separation = 'poor';

  return { onsetsMs, confidence, matchRate, separation, tooLoud, strokeCount: strokes.length };
}

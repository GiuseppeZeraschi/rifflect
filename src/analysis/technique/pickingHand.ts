/**
 * Picking/strumming-hand analyser (tasks.md T047) and the stroke detector reused by US4's
 * onset ↔ stroke attribution (research.md R16).
 */
import { TECHNIQUE } from '../config/thresholds';
import type { Finding } from '../types';
import { cv, handLength, WRIST } from './geometry';
import type { HandTracks } from './hands';

export interface Stroke {
  /** Time of the stroke's midpoint (ms) — when the hand passes the middle of its travel. */
  tMs: number;
  direction: 'down' | 'up';
  /** Travel in hand lengths. */
  amplitude: number;
}

/**
 * Strokes are the movements between turning points of the picking wrist's vertical position,
 * found with a zig-zag filter: a reversal only counts once it exceeds `minTravel` hand lengths.
 */
export function detectStrokes(tracks: HandTracks, minTravel = 0.2): Stroke[] {
  const samples: { t: number; y: number; scale: number }[] = [];
  tracks.pickingRaw.forEach((pts, i) => {
    if (pts) samples.push({ t: tracks.tMs[i]!, y: pts[WRIST]![1], scale: handLength(pts) || 0.1 });
  });
  if (samples.length < 4) return [];

  // Zig-zag: follow the current extreme; a move back past it by more than the threshold is a turn.
  const turning: { t: number; y: number }[] = [];
  let dir = 0; // +1 moving down (y increasing), −1 moving up, 0 not yet moving
  let ext = samples[0]!;
  for (const s of samples.slice(1)) {
    const thr = minTravel * s.scale;
    if (dir === 0) {
      if (Math.abs(s.y - ext.y) > thr) {
        turning.push({ t: ext.t, y: ext.y });
        dir = s.y > ext.y ? 1 : -1;
        ext = s;
      }
    } else if (dir === 1) {
      if (s.y >= ext.y) ext = s;
      else if (ext.y - s.y > thr) {
        turning.push({ t: ext.t, y: ext.y });
        dir = -1;
        ext = s;
      }
    } else if (s.y <= ext.y) {
      ext = s;
    } else if (s.y - ext.y > thr) {
      turning.push({ t: ext.t, y: ext.y });
      dir = 1;
      ext = s;
    }
  }
  turning.push({ t: ext.t, y: ext.y });

  const strokes: Stroke[] = [];
  for (let i = 1; i < turning.length; i++) {
    const a = turning[i - 1]!;
    const b = turning[i]!;
    const travel = Math.abs(b.y - a.y);
    const scale = samples[0]!.scale;
    if (travel < minTravel * scale) continue;
    // Midpoint crossing time, interpolated on the raw samples between the turning points.
    const midY = (a.y + b.y) / 2;
    let tMid = (a.t + b.t) / 2;
    const seg = samples.filter((s) => s.t >= a.t && s.t <= b.t);
    for (let k = 1; k < seg.length; k++) {
      const p = seg[k - 1]!;
      const q = seg[k]!;
      if ((p.y - midY) * (q.y - midY) <= 0 && p.y !== q.y) {
        tMid = p.t + ((midY - p.y) / (q.y - p.y)) * (q.t - p.t);
        break;
      }
    }
    strokes.push({ tMs: tMid, direction: b.y > a.y ? 'down' : 'up', amplitude: travel / scale });
  }
  return strokes;
}

export function analysePicking(tracks: HandTracks, onsetsMs: number[]): Finding[] {
  const strokes = detectStrokes(tracks);
  if (strokes.length < 8) return [];
  const conf = Math.min(0.9, 0.45 + 0.45 * tracks.coverage.picking) * Math.min(1, strokes.length / 16 + 0.5);
  const out: Finding[] = [];
  const intervals = strokes.slice(1).map((s, i) => s.tMs - strokes[i]!.tMs);
  const sorted = [...intervals].sort((a, b) => a - b);
  const medianInterval = sorted[sorted.length >> 1]!;

  // Stopped strum motion: long pauses in the stroke rhythm while notes keep sounding.
  const pauses = intervals
    .map((iv, i) => ({ iv, from: strokes[i]!.tMs, to: strokes[i + 1]!.tMs }))
    // Notes within 80 ms of the strokes at either end belong to those strokes, not to the pause.
    .filter(({ iv, from, to }) => iv > TECHNIQUE.strumPauseIntervals * medianInterval && onsetsMs.filter((o) => o > from + 80 && o < to - 80).length >= 2);
  if (pauses.length > 0) {
    const longest = pauses.reduce((x, y) => (y.iv > x.iv ? y : x));
    out.push({
      category: 'technique',
      aspect: 'picking_hand',
      issueCode: 'technique.stopped_strum_motion',
      severity: pauses.length > 2 ? 'moderate' : 'minor',
      confidence: conf,
      startMs: Math.round(longest.from),
      endMs: Math.round(longest.to),
      metrics: { pauses: pauses.length, longestPauseMs: Math.round(longest.iv) },
    });
  }

  // Inconsistent strum: stroke size or spacing varies a lot (excluding the pauses above).
  const regular = intervals.filter((iv) => iv <= TECHNIQUE.strumPauseIntervals * medianInterval);
  const ampCv = cv(strokes.map((s) => s.amplitude));
  const timeCv = cv(regular);
  if (ampCv > TECHNIQUE.strumInconsistentCv || timeCv > TECHNIQUE.strumInconsistentCv) {
    out.push({
      category: 'technique',
      aspect: 'picking_hand',
      issueCode: 'technique.inconsistent_strum',
      severity: Math.max(ampCv, timeCv) > 0.6 ? 'moderate' : 'minor',
      confidence: conf,
      startMs: Math.round(strokes[0]!.tMs),
      endMs: Math.round(strokes[strokes.length - 1]!.tMs),
      metrics: {
        sizeVariationPct: Math.round(ampCv * 100),
        timingVariationPct: Math.round(timeCv * 100),
        mainly: ampCv >= timeCv ? 'size' : 'timing',
      },
    });
  }
  return out;
}

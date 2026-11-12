/**
 * Timing against the accompaniment (tasks.md T088, FR-026). Unlike solo takes, the reference is
 * external, so overall "ahead"/"behind" is meaningful. Reports:
 * - timing.ahead_of_accompaniment / behind_accompaniment: overall (> 20 ms), or for a run of bars
 * - timing.locked_to_accompaniment: tight overall and no runs off
 * - timing.lost_place_in_loop: a run of notes consistently ≥ ¼ beat off the grid
 */
import { ACCOMPANIMENT } from '../config/thresholds';
import type { Finding, Severity } from '../types';
import type { AccompanimentGrid } from './grid';

export interface AccTimingResult {
  findings: Finding[];
  meanAbsOffsetMs: number | null;
  subdivision: 1 | 2 | 4;
}

const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / Math.max(1, xs.length);
const round5 = (x: number) => Math.round(x / 5) * 5;
const sev = (ms: number): Severity => (Math.abs(ms) >= 60 ? 'major' : Math.abs(ms) >= 40 ? 'moderate' : 'minor');

interface Placed {
  t: number;
  offset: number;
  bar: number;
  beatInBar: number | null;
}

function place(onsetsMs: number[], grid: AccompanimentGrid, sub: 1 | 2 | 4): Placed[] {
  return onsetsMs.map((t) => {
    const k = grid.beatAt(t) * sub;
    const nearest = Math.round(k);
    const offset = t - grid.timeAt(nearest / sub);
    const beat = Math.floor(nearest / sub);
    return {
      t,
      offset,
      bar: Math.floor(beat / grid.beatsPerBar) + 1,
      beatInBar: nearest % sub === 0 ? (((beat % grid.beatsPerBar) + grid.beatsPerBar) % grid.beatsPerBar) + 1 : null,
    };
  });
}

export function accompanimentTiming(liveOnsetsMs: number[], grid: AccompanimentGrid): AccTimingResult {
  if (liveOnsetsMs.length < 4) return { findings: [], meanAbsOffsetMs: null, subdivision: 1 };

  // Coarsest subdivision that explains the notes.
  let sub: 1 | 2 | 4 = 4;
  let placed = place(liveOnsetsMs, grid, 4);
  for (const s of [1, 2, 4] as const) {
    const p = place(liveOnsetsMs, grid, s);
    const unit = grid.periodMs / s;
    const onGrid = p.filter((x) => Math.abs(x.offset) <= 0.2 * unit).length / p.length;
    if (onGrid >= 0.8) {
      sub = s;
      placed = p;
      break;
    }
  }
  const unit = grid.periodMs / sub;
  const out: Finding[] = [];
  const n = placed.length;
  const conf = Math.min(0.92, 0.55 + n / 60);

  // Lost place: a run of ≥ 6 consecutive notes clearly off the grid, on the same side.
  let runStart = -1;
  const offGrid = (i: number) => Math.abs(placed[i]!.offset) >= 0.35 * unit && Math.abs(placed[i]!.offset) >= ACCOMPANIMENT.lostPlaceBeats * grid.periodMs * 0.5;
  const lostIdx = new Set<number>();
  for (let i = 0; i <= n; i++) {
    const sameSide = i < n && runStart >= 0 && Math.sign(placed[i]!.offset) === Math.sign(placed[runStart]!.offset);
    if (i < n && offGrid(i) && (runStart < 0 || sameSide)) {
      if (runStart < 0) runStart = i;
      continue;
    }
    if (runStart >= 0 && i - runStart >= 6) {
      const run = placed.slice(runStart, i);
      for (let k = runStart; k < i; k++) lostIdx.add(k);
      const shift = mean(run.map((x) => Math.abs(x.offset))) / grid.periodMs;
      out.push({
        category: 'timing',
        aspect: 'rhythm',
        issueCode: 'timing.lost_place_in_loop',
        severity: 'moderate',
        confidence: conf,
        startMs: Math.round(run[0]!.t),
        endMs: Math.round(run[run.length - 1]!.t),
        metrics: { shiftBeats: Math.max(0.25, Math.round(shift * 4) / 4), barFrom: run[0]!.bar, barTo: run[run.length - 1]!.bar },
      });
    }
    runStart = i < n && offGrid(i) ? i : -1;
  }

  const kept = placed.filter((_, i) => !lostIdx.has(i));
  const offsets = kept.map((x) => x.offset);
  const overall = mean(offsets);
  const meanAbs = mean(offsets.map(Math.abs));
  const threshold = ACCOMPANIMENT.aheadBehindMs;

  if (Math.abs(overall) > threshold) {
    out.push({
      category: 'timing',
      aspect: 'rhythm',
      issueCode: overall < 0 ? 'timing.ahead_of_accompaniment' : 'timing.behind_accompaniment',
      severity: sev(overall),
      confidence: conf,
      startMs: Math.round(kept[0]?.t ?? 0),
      endMs: Math.round(kept[kept.length - 1]?.t ?? 0),
      metrics: { meanOffsetMs: round5(overall), count: kept.length },
    });
  } else {
    // Runs of bars ahead/behind (e.g. "rushed in bars 5–6").
    const byBar = new Map<number, number[]>();
    for (const x of kept) byBar.set(x.bar, [...(byBar.get(x.bar) ?? []), x.offset]);
    const bars = [...byBar.keys()].sort((a, b) => a - b);
    let i = 0;
    while (i < bars.length) {
      const m = mean(byBar.get(bars[i]!)!);
      if (byBar.get(bars[i]!)!.length < 2 || Math.abs(m) <= threshold) {
        i++;
        continue;
      }
      let j = i;
      while (
        j + 1 < bars.length &&
        bars[j + 1] === bars[j]! + 1 &&
        byBar.get(bars[j + 1]!)!.length >= 2 &&
        Math.sign(mean(byBar.get(bars[j + 1]!)!)) === Math.sign(m) &&
        Math.abs(mean(byBar.get(bars[j + 1]!)!)) > threshold
      )
        j++;
      const runOffsets = bars.slice(i, j + 1).flatMap((b) => byBar.get(b)!);
      const runNotes = kept.filter((x) => x.bar >= bars[i]! && x.bar <= bars[j]!);
      const runMean = mean(runOffsets);
      out.push({
        category: 'timing',
        aspect: 'rhythm',
        issueCode: runMean < 0 ? 'timing.ahead_of_accompaniment' : 'timing.behind_accompaniment',
        severity: sev(runMean),
        confidence: conf * Math.min(1, 0.6 + runOffsets.length / 10),
        startMs: Math.round(runNotes[0]!.t),
        endMs: Math.round(runNotes[runNotes.length - 1]!.t),
        metrics: { meanOffsetMs: round5(runMean), count: runOffsets.length, barFrom: bars[i]!, barTo: bars[j]! },
      });
      i = j + 1;
    }
  }

  if (!out.some((f) => f.issueCode !== 'timing.lost_place_in_loop') && meanAbs <= threshold && !out.length) {
    out.push({
      category: 'timing',
      aspect: 'rhythm',
      issueCode: 'timing.locked_to_accompaniment',
      severity: 'info',
      confidence: conf,
      startMs: Math.round(kept[0]?.t ?? 0),
      endMs: Math.round(kept[kept.length - 1]?.t ?? 0),
      metrics: { meanAbsOffsetMs: round5(meanAbs) },
    });
  }
  return { findings: out, meanAbsOffsetMs: meanAbs, subdivision: sub };
}

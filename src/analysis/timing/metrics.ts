/** Timing metrics from a fitted beat grid (tasks.md T044). */
import type { BeatGrid, GridAssignment } from './beatGrid';

export interface BeatPositionStats {
  beat: number;
  count: number;
  meanMs: number;
  stdMs: number;
  /** t-statistic of the mean (how sure we are it isn't zero). */
  tStat: number;
  firstMs: number;
  lastMs: number;
  firstBar: number;
  lastBar: number;
}

export interface TimingMetrics {
  meanAbsOffsetMs: number;
  /** Std of offsets after removing systematic per-beat-position bias. */
  unevenStdMs: number;
  driftBpm: number;
  perBeat: BeatPositionStats[];
  inliers: GridAssignment[];
  firstMs: number;
  lastMs: number;
}

const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / Math.max(1, xs.length);
const std = (xs: number[]) => {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1));
};

export function timingMetrics(grid: BeatGrid): TimingMetrics {
  const inliers = grid.assignments.filter((a) => !a.outlier);
  const perBeat: BeatPositionStats[] = [];
  const byBeat = new Map<number, GridAssignment[]>();
  for (const a of inliers) {
    if (a.beatInBar === null) continue;
    byBeat.set(a.beatInBar, [...(byBeat.get(a.beatInBar) ?? []), a]);
  }
  for (const [beat, list] of [...byBeat.entries()].sort((x, y) => x[0] - y[0])) {
    const r = list.map((a) => a.residualMs);
    const m = mean(r);
    const s = std(r);
    perBeat.push({
      beat,
      count: list.length,
      meanMs: m,
      stdMs: s,
      tStat: s > 0 ? Math.abs(m) / (s / Math.sqrt(list.length)) : Math.abs(m) > 0 ? 99 : 0,
      firstMs: list[0]!.onsetMs,
      lastMs: list[list.length - 1]!.onsetMs,
      firstBar: list[0]!.bar,
      lastBar: list[list.length - 1]!.bar,
    });
  }
  const biasByBeat = new Map(perBeat.map((p) => [p.beat, p.meanMs]));
  const debiased = inliers.map((a) => a.residualMs - (a.beatInBar !== null ? (biasByBeat.get(a.beatInBar) ?? 0) : 0));
  return {
    meanAbsOffsetMs: mean(inliers.map((a) => Math.abs(a.residualMs))),
    unevenStdMs: std(debiased),
    driftBpm: grid.bpmEnd - grid.bpmStart,
    perBeat,
    inliers,
    firstMs: grid.assignments[0]?.onsetMs ?? 0,
    lastMs: grid.assignments[grid.assignments.length - 1]?.onsetMs ?? 0,
  };
}

/**
 * Tempo and beat grid (tasks.md T043, research.md R6).
 *
 * 1. Beat period from the autocorrelation of the onset-strength envelope over 60–220 BPM: the
 *    shortest lag whose peak is close to the strongest one. A target tempo, if given, picks between
 *    half / same / double tempo.
 * 2. Grid: rather than a beat tracker that snaps beats onto notes (which would hide the very timing
 *    errors we report), onsets are assigned to grid units and a smooth tempo curve is fitted by
 *    least squares: t(k) = a + b·k + c·k² (k = grid unit index). Residuals are the timing offsets;
 *    the curve's slope gives local tempo and drift.
 * 3. Subdivision: the coarsest of beat / eighth / sixteenth that explains the onsets.
 *
 * Beat 1 is assumed to be the first onset, in 4/4 (no downbeat reference exists in solo takes).
 */
import { TEMPO } from '../config/thresholds';
import { defaultDsp, type Dsp } from '../dsp';

export const BEATS_PER_BAR = 4;

export interface GridAssignment {
  onsetMs: number;
  /** Grid unit index (k). */
  k: number;
  /** Onset − grid time (ms). Negative = early. */
  residualMs: number;
  /** 1-based beat within the bar, or null for off-beat (subdivision) onsets. */
  beatInBar: number | null;
  /** 1-based bar number. */
  bar: number;
  /** True if excluded from the fit as an outlier. */
  outlier: boolean;
}

export interface BeatGrid {
  /** Average tempo over the take (beats per minute). */
  bpm: number;
  bpmStart: number;
  bpmEnd: number;
  /** Grid units per beat: 1 = beats, 2 = eighths, 4 = sixteenths. */
  subdivision: 1 | 2 | 4;
  /** Fitted curve t(k) = a + b·k + c·k². */
  coeffs: [number, number, number];
  assignments: GridAssignment[];
  timeAt(k: number): number;
}

/** Beat period estimate (ms) from the onset envelope, or null if no periodicity. */
export function estimateBeatPeriodMs(
  envelope: Float32Array,
  envelopeRate: number,
  targetBpm?: number,
  dsp: Dsp = defaultDsp,
): number | null {
  const lagMin = Math.floor((envelopeRate * 60) / TEMPO.maxBpm);
  const lagMax = Math.ceil((envelopeRate * 60) / TEMPO.minBpm);
  if (envelope.length < lagMax * 2) return null;
  const ac = dsp.autocorrelate(envelope, lagMax + 1);
  const peaks: { lag: number; value: number }[] = [];
  for (let lag = Math.max(2, lagMin); lag <= lagMax; lag++) {
    const v = ac[lag]!;
    if (v > ac[lag - 1]! && v >= ac[lag + 1]!) {
      // Parabolic interpolation for sub-frame lag precision.
      const y0 = ac[lag - 1]!,
        y2 = ac[lag + 1]!;
      const denom = y0 - 2 * v + y2;
      const shift = denom !== 0 ? (0.5 * (y0 - y2)) / denom : 0;
      peaks.push({ lag: lag + Math.max(-0.5, Math.min(0.5, shift)), value: v });
    }
  }
  if (peaks.length === 0) return null;
  const maxValue = Math.max(...peaks.map((p) => p.value));
  if (maxValue < 0.1) return null;
  const chosen = peaks.find((p) => p.value >= TEMPO.periodPeakFraction * maxValue)!;
  let periodMs = (chosen.lag / envelopeRate) * 1000;

  if (targetBpm) {
    const targetMs = 60000 / targetBpm;
    const candidates = [periodMs / 2, periodMs, periodMs * 2].filter((p) => {
      const bpm = 60000 / p;
      return bpm >= TEMPO.minBpm / 2 && bpm <= TEMPO.maxBpm * 2;
    });
    periodMs = candidates.reduce((best, p) =>
      Math.abs(Math.log(p / targetMs)) < Math.abs(Math.log(best / targetMs)) ? p : best,
    );
  }
  return periodMs;
}

/** Solve a 3×3 linear system (Gaussian elimination with partial pivoting). */
function solve3(m: number[][], v: number[]): number[] | null {
  const a = m.map((row, i) => [...row, v[i]!]);
  for (let col = 0; col < 3; col++) {
    let pivot = col;
    for (let r = col + 1; r < 3; r++) if (Math.abs(a[r]![col]!) > Math.abs(a[pivot]![col]!)) pivot = r;
    if (Math.abs(a[pivot]![col]!) < 1e-12) return null;
    [a[col], a[pivot]] = [a[pivot]!, a[col]!];
    for (let r = 0; r < 3; r++) {
      if (r === col) continue;
      const f = a[r]![col]! / a[col]![col]!;
      for (let c = col; c < 4; c++) a[r]![c]! -= f * a[col]![c]!;
    }
  }
  return [a[0]![3]! / a[0]![0]!, a[1]![3]! / a[1]![1]!, a[2]![3]! / a[2]![2]!];
}

/** Least-squares fit of t = a + b·k (+ c·k² when `quadratic`). */
function fitCurve(ks: number[], ts: number[], quadratic: boolean): [number, number, number] | null {
  const n = ks.length;
  if (n < 3) return null;
  if (!quadratic) {
    let sk = 0,
      st = 0,
      skk = 0,
      skt = 0;
    for (let i = 0; i < n; i++) {
      sk += ks[i]!;
      st += ts[i]!;
      skk += ks[i]! * ks[i]!;
      skt += ks[i]! * ts[i]!;
    }
    const d = n * skk - sk * sk;
    if (d === 0) return null;
    const b = (n * skt - sk * st) / d;
    return [(st - b * sk) / n, b, 0];
  }
  const s = [0, 0, 0, 0, 0];
  const r = [0, 0, 0];
  for (let i = 0; i < n; i++) {
    let p = 1;
    for (let e = 0; e < 5; e++) {
      s[e]! += p;
      if (e < 3) r[e]! += p * ts[i]!;
      p *= ks[i]!;
    }
  }
  const sol = solve3(
    [
      [s[0]!, s[1]!, s[2]!],
      [s[1]!, s[2]!, s[3]!],
      [s[2]!, s[3]!, s[4]!],
    ],
    r,
  );
  return sol ? [sol[0]!, sol[1]!, sol[2]!] : null;
}

interface UnitFit {
  coeffs: [number, number, number];
  ks: number[];
  residuals: number[];
  outliers: boolean[];
  meanAbs: number;
}

/** Assign onsets to grid units of ~unitMs and fit a smooth tempo curve, rejecting outliers. */
function fitUnits(onsetsMs: number[], unitMs: number): UnitFit | null {
  if (onsetsMs.length < 4) return null;
  const ks: number[] = [0];
  for (let i = 1; i < onsetsMs.length; i++) {
    const steps = Math.max(1, Math.round((onsetsMs[i]! - onsetsMs[i - 1]!) / unitMs));
    ks.push(ks[i - 1]! + steps);
  }
  const quadratic = onsetsMs.length >= 12;
  let use = onsetsMs.map(() => true);
  let coeffs: [number, number, number] | null = null;
  for (let iter = 0; iter < 3; iter++) {
    const kSel = ks.filter((_, i) => use[i]);
    const tSel = onsetsMs.filter((_, i) => use[i]);
    coeffs = fitCurve(kSel, tSel, quadratic);
    if (!coeffs) return null;
    const c = coeffs;
    const next = onsetsMs.map((t, i) => Math.abs(t - (c[0] + c[1] * ks[i]! + c[2] * ks[i]! ** 2)) <= 0.3 * unitMs);
    if (next.filter(Boolean).length < 4 || next.every((v, i) => v === use[i])) break;
    use = next;
  }
  const c = coeffs!;
  const residuals = onsetsMs.map((t, i) => t - (c[0] + c[1] * ks[i]! + c[2] * ks[i]! ** 2));
  const inliers = residuals.filter((_, i) => use[i]);
  const meanAbs = inliers.reduce((s, r) => s + Math.abs(r), 0) / Math.max(1, inliers.length);
  return { coeffs: c, ks, residuals, outliers: use.map((u) => !u), meanAbs };
}

export function fitBeatGrid(onsetsMs: number[], beatPeriodMs: number): BeatGrid | null {
  if (onsetsMs.length < 6) return null;
  let chosen: { sub: 1 | 2 | 4; fit: UnitFit } | null = null;
  for (const sub of [1, 2, 4] as const) {
    const unit = beatPeriodMs / sub;
    if (unit < 60) break; // faster than any playable subdivision
    const fit = fitUnits(onsetsMs, unit);
    if (!fit) continue;
    // The fitted unit must match the unit we asked for; otherwise onsets were forced onto the wrong
    // level (e.g. eighth notes counted as beats).
    if (Math.abs(fit.coeffs[1] / unit - 1) > 0.25) continue;
    const good = fit.meanAbs <= Math.min(40, 0.15 * unit) && fit.outliers.filter(Boolean).length <= onsetsMs.length * 0.2;
    if (!chosen || fit.meanAbs < chosen.fit.meanAbs * 0.6) chosen = { sub, fit };
    if (good) {
      chosen = { sub, fit };
      break;
    }
  }
  if (!chosen) return null;
  const { sub, fit } = chosen;
  const [a, b, c] = fit.coeffs;
  const kMax = fit.ks[fit.ks.length - 1]!;
  if (b <= 0 || kMax <= 0) return null;
  const meanUnit = b + c * kMax;
  const startUnit = b;
  const endUnit = b + 2 * c * kMax;
  const toBpm = (unit: number) => 60000 / (unit * sub);
  return {
    bpm: toBpm(meanUnit),
    bpmStart: toBpm(startUnit),
    bpmEnd: toBpm(endUnit),
    subdivision: sub,
    coeffs: fit.coeffs,
    timeAt: (k: number) => a + b * k + c * k * k,
    assignments: onsetsMs.map((onsetMs, i) => {
      const k = fit.ks[i]!;
      const beatIndex = Math.floor(k / sub);
      return {
        onsetMs,
        k,
        residualMs: fit.residuals[i]!,
        beatInBar: k % sub === 0 ? (beatIndex % BEATS_PER_BAR) + 1 : null,
        bar: Math.floor(beatIndex / BEATS_PER_BAR) + 1,
        outlier: fit.outliers[i]!,
      };
    }),
  };
}

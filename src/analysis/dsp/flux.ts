import { binOf, type Spectrogram } from './stft';

/**
 * Half-wave-rectified spectral flux on log-compressed magnitudes, limited to a frequency band.
 * flux[f] measures the energy increase from frame f−1 to f; flux[0] = 0.
 */
export function spectralFlux(spec: Spectrogram, { lowHz, highHz }: { lowHz: number; highHz: number }): Float32Array {
  const lo = binOf(spec, lowHz);
  const hi = binOf(spec, highHz);
  const flux = new Float32Array(spec.frames);
  const prev = new Float32Array(hi - lo + 1);
  for (let f = 0; f < spec.frames; f++) {
    const row = f * spec.bins;
    let sum = 0;
    for (let b = lo; b <= hi; b++) {
      const v = Math.log1p(100 * spec.data[row + b]!);
      const d = v - prev[b - lo]!;
      if (f > 0 && d > 0) sum += d;
      prev[b - lo] = v;
    }
    flux[f] = sum;
  }
  return flux;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

export interface PeakOptions {
  /** Adaptive threshold = median(flux over ±medianWindow) × factor + offset × (max − min). */
  medianWindow: number;
  factor: number;
  offset: number;
  /** Minimum frames between picked peaks. */
  minGapFrames: number;
}

/** Local maxima above an adaptive median threshold, at least `minGapFrames` apart. */
export function pickPeaks(flux: Float32Array, o: PeakOptions): number[] {
  let max = -Infinity,
    min = Infinity;
  for (const v of flux) {
    if (v > max) max = v;
    if (v < min) min = v;
  }
  const range = Math.max(1e-9, max - min);
  const peaks: number[] = [];
  for (let f = 1; f < flux.length - 1; f++) {
    const v = flux[f]!;
    if (v < flux[f - 1]! || v < flux[f + 1]!) continue;
    const lo = Math.max(0, f - o.medianWindow);
    const hi = Math.min(flux.length, f + o.medianWindow + 1);
    const threshold = median(Array.from(flux.subarray(lo, hi))) * o.factor + o.offset * range + min;
    if (v <= threshold) continue;
    const last = peaks[peaks.length - 1];
    if (last !== undefined && f - last < o.minGapFrames) {
      if (v > flux[last]!) peaks[peaks.length - 1] = f;
      continue;
    }
    peaks.push(f);
  }
  return peaks;
}

/** Fraction of frames whose flux exceeds a small activity threshold (used for "no playing"). */
export function activeFraction(flux: Float32Array, relThreshold = 0.1): number {
  let max = 0;
  for (const v of flux) if (v > max) max = v;
  if (max <= 0) return 0;
  let active = 0;
  for (const v of flux) if (v > relThreshold * max) active++;
  return active / Math.max(1, flux.length);
}

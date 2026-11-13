/**
 * "Is there guitar playing here?" (contract guarantee 1, FR-012).
 *
 * Onset activity alone isn't enough: talking and background noise also produce onsets. A guitar
 * note has a sharp attack followed by a clearly pitched (periodic) sound, so we count onsets that
 * look like plucks: energy jumps within ~15 ms, then the signal is strongly periodic at a pitch
 * in the guitar range (80 Hz – 1 kHz).
 */
import { AUDIO, ONSETS } from './config/thresholds';

const SR = AUDIO.sampleRate;
const toS = (ms: number) => Math.round((ms / 1000) * SR);

function energy(x: Float32Array, fromMs: number, toMs: number): number {
  const a = Math.max(0, toS(fromMs));
  const b = Math.min(x.length, toS(toMs));
  let e = 0;
  for (let i = a; i < b; i++) e += x[i]! * x[i]!;
  return e / Math.max(1, b - a);
}

/**
 * Pitch clarity in [fromMs, toMs): the normalised autocorrelation at the first genuine peak after
 * the correlation's first dip, for periods of 1–12.5 ms (80 Hz – 1 kHz). Low-passed noise correlates
 * strongly at short lags but decays without such a peak, so it scores low; a pitched note scores high.
 */
export function periodicity(x: Float32Array, fromMs: number, toMs: number): number {
  const a = Math.max(0, toS(fromMs));
  const b = Math.min(x.length, toS(toMs));
  const maxLag = toS(12.5);
  const minLag = toS(1);
  const end = b - maxLag - 1;
  if (end - a < maxLag) return 0;
  const r = new Float64Array(maxLag + 2);
  for (let lag = 0; lag <= maxLag + 1; lag++) {
    let c = 0,
      e0 = 0,
      e1 = 0;
    for (let i = a; i < end; i++) {
      c += x[i]! * x[i + lag]!;
      e0 += x[i]! * x[i]!;
      e1 += x[i + lag]! * x[i + lag]!;
    }
    r[lag] = e0 > 0 && e1 > 0 ? c / Math.sqrt(e0 * e1) : 0;
  }
  // Walk down to the first dip, then take the highest local maximum within the pitch range.
  let lag = 1;
  while (lag <= maxLag && r[lag]! <= r[lag - 1]!) lag++;
  let best = 0;
  for (let k = Math.max(lag, minLag); k <= maxLag; k++) {
    if (r[k]! > r[k - 1]! && r[k]! >= r[k + 1]! && r[k]! > best) best = r[k]!;
  }
  return best;
}

export function isPluckLike(samples: Float32Array, onsetMs: number): boolean {
  const before = energy(samples, onsetMs - 30, onsetMs - 5);
  const attack = energy(samples, onsetMs, onsetMs + 15);
  if (attack <= before * ONSETS.pluckAttackRatio + 1e-10) return false;
  return periodicity(samples, onsetMs + 30, onsetMs + 130) >= ONSETS.pluckPeriodicity;
}

/** Number of pluck-like onsets, stopping early once `enough` are found. */
export function countPluckLike(samples: Float32Array, onsetsMs: number[], enough = Infinity): number {
  let n = 0;
  for (const t of onsetsMs) {
    if (isPluckLike(samples, t) && ++n >= enough) break;
  }
  return n;
}

export function hasPlaying(samples: Float32Array, onsetsMs: number[]): boolean {
  if (onsetsMs.length < ONSETS.minPluckOnsets) return false;
  const plucks = countPluckLike(samples, onsetsMs);
  return plucks >= ONSETS.minPluckOnsets && plucks / onsetsMs.length >= ONSETS.minPluckShare;
}

/**
 * Drop handling noise at the start and end of a take: unpitched onsets within ONSETS.handlingEdgeMs
 * of either end (the tap on Record or Stop). Found on real takes, where the Record tap became
 * "beat 1" and counted as a buzzed note.
 */
export function dropHandlingNoise(samples: Float32Array, onsetsMs: number[]): number[] {
  const endMs = (samples.length / SR) * 1000;
  return onsetsMs.filter((t) => {
    const atEdge = t < ONSETS.handlingEdgeMs || t > endMs - ONSETS.handlingEdgeMs;
    return !atEdge || periodicity(samples, t + 30, t + 130) >= ONSETS.handlingMaxPeriodicity;
  });
}

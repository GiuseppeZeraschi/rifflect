/**
 * Accompaniment detection (tasks.md T083, research.md R16).
 *
 * - click: sample-exact periodic, short high-frequency transients (a metronome). Checked first,
 *   because a click also repeats exactly.
 * - loop: a looper replays the recorded sound exactly, so the waveform correlates strongly with
 *   itself at the loop length. Human repetition never matches at waveform level (timing and phase
 *   vary), so solo riffs don't trigger this. Computed on a 4× downsampled signal via FFT
 *   autocorrelation, then refined to sample accuracy at full rate.
 * - backing: steady low-frequency percussion (kick/bass below the guitar's range) plus noisy
 *   high-frequency hits (hats), without exact repetition.
 * - none: none of the above.
 */
import { ACCOMPANIMENT, AUDIO } from '../config/thresholds';
import { fftInPlace } from '../dsp/fft';
import type { AccompanimentKind } from '../types';

export interface Detection {
  kind: AccompanimentKind;
  loopLengthMs: number | null;
  clickPeriodMs: number | null;
  /** The click times found (for the grid). */
  clickTimesMs: number[];
  /** Strength of the evidence, 0..1 (loop: waveform correlation; click: grid coverage). */
  strength: number;
}

const SR = AUDIO.sampleRate;

// ---- Loop ---------------------------------------------------------------------------------

const DECIMATE = 4;

function decimate(x: Float32Array): Float32Array {
  const n = Math.floor(x.length / DECIMATE);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let k = 0; k < DECIMATE; k++) s += x[i * DECIMATE + k]!;
    out[i] = s / DECIMATE;
  }
  return out;
}

/** Normalised autocorrelation for every lag: Σ x[t]x[t+L] / sqrt(Σ_{overlap} x² · Σ_{overlap} x²). */
function normalisedAutocorr(x: Float32Array, maxLag: number): Float32Array {
  const n = x.length;
  let size = 1;
  while (size < 2 * n) size <<= 1;
  const re = new Float64Array(size);
  const im = new Float64Array(size);
  for (let i = 0; i < n; i++) re[i] = x[i]!;
  fftInPlace(re, im);
  for (let i = 0; i < size; i++) {
    re[i] = re[i]! * re[i]! + im[i]! * im[i]!;
    im[i] = 0;
  }
  fftInPlace(re, im); // real, even spectrum → forward FFT = size × inverse
  const cum = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) cum[i + 1] = cum[i]! + x[i]! * x[i]!;
  const out = new Float32Array(Math.min(maxLag, n - 1) + 1);
  for (let lag = 0; lag < out.length; lag++) {
    const eHead = cum[n - lag]!; // x[0 .. n-lag)
    const eTail = cum[n]! - cum[lag]!; // x[lag .. n)
    const denom = Math.sqrt(eHead * eTail);
    out[lag] = denom > 0 ? re[lag]! / size / denom : 0;
  }
  return out;
}

/** Normalised correlation of x with itself shifted by `lag` samples, over a window. */
function correlationAt(x: Float32Array, lag: number, from: number, len: number): number {
  let c = 0,
    e0 = 0,
    e1 = 0;
  const end = Math.min(from + len, x.length - lag);
  for (let i = from; i < end; i++) {
    c += x[i]! * x[i + lag]!;
    e0 += x[i]! * x[i]!;
    e1 += x[i + lag]! * x[i + lag]!;
  }
  return e0 > 0 && e1 > 0 ? c / Math.sqrt(e0 * e1) : 0;
}

export function detectLoop(samples: Float32Array): { loopMs: number; strength: number } | null {
  const durationMs = (samples.length / SR) * 1000;
  const maxLoopMs = Math.min(ACCOMPANIMENT.maxLoopMs, durationMs / ACCOMPANIMENT.minLoopCycles);
  if (maxLoopMs < ACCOMPANIMENT.minLoopMs) return null;
  const small = decimate(samples);
  const rate = SR / DECIMATE;
  const minLag = Math.round((ACCOMPANIMENT.minLoopMs / 1000) * rate);
  const maxLag = Math.round((maxLoopMs / 1000) * rate);
  const ac = normalisedAutocorr(small, maxLag);
  let best = 0;
  for (let lag = minLag; lag <= maxLag; lag++) best = Math.max(best, ac[lag]!);
  if (best < ACCOMPANIMENT.loopMinCorrelation) return null;
  // The loop length is the shortest strong peak (multiples of it are also strong).
  let coarse = -1;
  for (let lag = minLag + 1; lag < maxLag; lag++) {
    const v = ac[lag]!;
    if (v >= 0.8 * best && v >= ac[lag - 1]! && v >= ac[lag + 1]!) {
      coarse = lag;
      break;
    }
  }
  if (coarse < 0) return null;
  // Refine at full sample rate around the coarse lag (±2 decimated samples).
  const centre = coarse * DECIMATE;
  const window = Math.min(samples.length - centre - 1, SR * 10);
  const from = Math.max(0, Math.floor((samples.length - centre - window) / 2));
  let bestLag = centre;
  let bestCorr = -Infinity;
  for (let lag = centre - 2 * DECIMATE; lag <= centre + 2 * DECIMATE; lag++) {
    const c = correlationAt(samples, lag, from, window);
    if (c > bestCorr) {
      bestCorr = c;
      bestLag = lag;
    }
  }
  // A real loop repeats throughout; chance alignments (e.g. identical drum samples) don't.
  const quarter = Math.floor((samples.length - bestLag) / 4);
  const perQuarter = [0, 1, 2, 3].map((q) => correlationAt(samples, bestLag, q * quarter, quarter));
  const weakest = Math.min(...perQuarter);
  if (weakest < ACCOMPANIMENT.loopMinCorrelation) return null;
  return { loopMs: (bestLag / SR) * 1000, strength: Math.max(0, Math.min(1, weakest)) };
}

// ---- Click --------------------------------------------------------------------------------

/** Times (ms, sample-accurate) of strong, short high-frequency transients. */
export function highFrequencyTransients(samples: Float32Array): number[] {
  const block = 64;
  const nBlocks = Math.floor(samples.length / block);
  const env = new Float32Array(nBlocks);
  const peakIdx = new Int32Array(nBlocks);
  for (let b = 0; b < nBlocks; b++) {
    let e = 0,
      peak = 0,
      at = b * block;
    for (let i = Math.max(2, b * block); i < (b + 1) * block; i++) {
      const d = samples[i]! - 2 * samples[i - 1]! + samples[i - 2]!;
      e += d * d;
      if (Math.abs(d) > peak) {
        peak = Math.abs(d);
        at = i;
      }
    }
    env[b] = e;
    peakIdx[b] = at;
  }
  const sorted = Float32Array.from(env).sort();
  const median = sorted[sorted.length >> 1]! || 1e-12;
  const out: number[] = [];
  for (let b = 1; b < nBlocks - 10; b++) {
    if (env[b]! < 20 * median || env[b]! < env[b - 1]! || env[b]! < env[b + 1]!) continue;
    // Short: high-frequency energy ~25 ms later has fallen right away.
    const later = env[b + 9]!;
    if (later > 0.05 * env[b]!) continue;
    out.push((peakIdx[b]! / SR) * 1000);
  }
  return out;
}

const SEG = 512; // ~23 ms
const segWindow = Float64Array.from({ length: SEG }, (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (SEG - 1)));

/**
 * Share of a ~23 ms segment's energy in the guitar's range (80 Hz – 2.5 kHz), from an FFT.
 * A metronome click sits almost entirely above it; a strum or note onset almost entirely within it.
 */
export function guitarBandShare(samples: Float32Array, atMs: number): number {
  const from = Math.round((atMs / 1000) * SR) - 32;
  if (from < 0 || from + SEG > samples.length) return 1;
  const re = new Float64Array(SEG);
  const im = new Float64Array(SEG);
  for (let i = 0; i < SEG; i++) re[i] = samples[from + i]! * segWindow[i]!;
  fftInPlace(re, im);
  const lo = Math.round((80 * SEG) / SR);
  const hi = Math.round((2500 * SEG) / SR);
  let band = 0,
    all = 0;
  for (let k = 1; k <= SEG / 2; k++) {
    const e = re[k]! * re[k]! + im[k]! * im[k]!;
    all += e;
    if (k >= lo && k <= hi) band += e;
  }
  return all > 0 ? band / all : 1;
}

/**
 * Average the waveform across regularly repeating hits (synchronous averaging). Whatever repeats
 * exactly survives; live playing, which differs each time, averages away. Returns the guitar-band
 * share of the average and how quickly it dies away. A metronome click is a short, high blip.
 */
function repeatingTemplateIsClick(samples: Float32Array, times: number[]): boolean {
  const len = SEG * 4; // ~93 ms
  const avg = new Float64Array(len);
  let n = 0;
  for (const t of times) {
    const from = Math.round((t / 1000) * SR) - 32;
    if (from < 0 || from + len > samples.length) continue;
    for (let i = 0; i < len; i++) avg[i]! += samples[from + i]!;
    n++;
  }
  if (n < 8) return false;
  const tmpl = Float32Array.from(avg, (v) => v / n);
  // Short: energy in 40–90 ms is tiny compared with the first 20 ms.
  let early = 0,
    late = 0;
  for (let i = 0; i < Math.round(0.02 * SR); i++) early += tmpl[i]! * tmpl[i]!;
  for (let i = Math.round(0.04 * SR); i < Math.round(0.09 * SR); i++) late += tmpl[i]! * tmpl[i]!;
  if (early === 0 || late > 0.05 * early) return false;
  return guitarBandShare(tmpl, (32 / SR) * 1000) < ACCOMPANIMENT.clickMaxGuitarShare;
}

export function detectClick(samples: Float32Array): { periodMs: number; strength: number; times: number[] } | null {
  const times = highFrequencyTransients(samples);
  if (times.length < 10) return null;
  // Candidate period: the most common gap between transients up to 3 apart (1 ms bins, 250–1500 ms).
  const hist = new Map<number, number>();
  for (let i = 0; i < times.length; i++) {
    for (let j = i + 1; j < Math.min(times.length, i + 4); j++) {
      const gap = Math.round(times[j]! - times[i]!);
      if (gap >= 250 && gap <= 1500) hist.set(gap, (hist.get(gap) ?? 0) + 1);
    }
  }
  let period = 0,
    votes = 0;
  for (const [gap, n] of hist) {
    const v = n + (hist.get(gap - 1) ?? 0) + (hist.get(gap + 1) ?? 0);
    if (v > votes) {
      votes = v;
      period = gap;
    }
  }
  if (votes < 8) return null;
  // Longest run of transients on a grid of this period (up to 3 missed beats between hits).
  let bestRun: number[] = [];
  for (let s = 0; s < times.length; s++) {
    const run = [times[s]!];
    let last = times[s]!;
    for (let k = s + 1; k < times.length; k++) {
      const gap = times[k]! - last;
      const beats = Math.round(gap / period);
      if (beats >= 1 && beats <= 4 && Math.abs(gap - beats * period) <= 3) {
        run.push(times[k]!);
        last = times[k]!;
      } else if (gap > 4 * period + 3) break;
    }
    if (run.length > bestRun.length) bestRun = run;
  }
  if (bestRun.length < 10) return null;
  // Regularity: residuals of a straight-line fit t = a + b·k (k = beat index).
  const ks = bestRun.map((t) => Math.round((t - bestRun[0]!) / period));
  const n = ks.length;
  const mk = ks.reduce((a, b) => a + b, 0) / n;
  const mt = bestRun.reduce((a, b) => a + b, 0) / n;
  let num = 0,
    den = 0;
  for (let i = 0; i < n; i++) {
    num += (ks[i]! - mk) * (bestRun[i]! - mt);
    den += (ks[i]! - mk) ** 2;
  }
  const mean = den > 0 ? num / den : period;
  const sd = Math.sqrt(bestRun.reduce((a, t, i) => a + (t - (mt + mean * (ks[i]! - mk))) ** 2, 0) / n);
  if (sd > ACCOMPANIMENT.clickMaxJitterMs) return null;
  // Exactly periodic, but is it a click or a looped strum? Look at what repeats.
  if (!repeatingTemplateIsClick(samples, bestRun)) return null;
  const span = bestRun[bestRun.length - 1]! - bestRun[0]!;
  const durationMs = (samples.length / SR) * 1000;
  if (span < 0.5 * durationMs) return null;
  return { periodMs: mean, strength: Math.min(1, span / durationMs), times: bestRun };
}

// ---- Backing ------------------------------------------------------------------------------

/** Two cascaded one-pole low-passes — a gentle 70 Hz cut that keeps kick drum and bass. */
export function lowBandShare(samples: Float32Array): number {
  const a = Math.exp((-2 * Math.PI * ACCOMPANIMENT.backingLowHz) / SR);
  const r = Math.exp((-2 * Math.PI * 20) / SR); // DC blocker (~20 Hz high-pass)
  let px = 0,
    hp = 0,
    y1 = 0,
    y2 = 0,
    y3 = 0,
    y4 = 0,
    low = 0,
    all = 0;
  for (let i = 0; i < samples.length; i++) {
    hp = r * (hp + samples[i]! - px);
    px = samples[i]!;
    y1 = a * y1 + (1 - a) * hp;
    y2 = a * y2 + (1 - a) * y1;
    y3 = a * y3 + (1 - a) * y2;
    y4 = a * y4 + (1 - a) * y3;
    low += y4 * y4;
    all += hp * hp;
  }
  return all > 0 ? low / all : 0;
}

/** Rate (per second) of short, noisy high-frequency hits (hi-hats), regardless of regularity. */
export function noisyHitRate(samples: Float32Array): number {
  return highFrequencyTransients(samples).length / (samples.length / SR);
}

export function detectAccompaniment(samples: Float32Array): Detection {
  const none: Detection = { kind: 'none', loopLengthMs: null, clickPeriodMs: null, clickTimesMs: [], strength: 0 };
  if (samples.length < SR * 2) return none;

  const click = detectClick(samples);
  if (click) return { kind: 'click', loopLengthMs: null, clickPeriodMs: click.periodMs, clickTimesMs: click.times, strength: click.strength };

  const loop = detectLoop(samples);
  if (loop) return { kind: 'loop', loopLengthMs: loop.loopMs, clickPeriodMs: null, clickTimesMs: [], strength: loop.strength };

  if (lowBandShare(samples) >= ACCOMPANIMENT.backingMinLowShare && noisyHitRate(samples) >= ACCOMPANIMENT.backingMinHitRate) {
    return { kind: 'backing', loopLengthMs: null, clickPeriodMs: null, clickTimesMs: [], strength: 0.5 };
  }
  return none;
}

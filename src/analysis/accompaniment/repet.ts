/**
 * REPET separation for loops (tasks.md T085, research.md R16; Rafii & Pardo's REpeating Pattern
 * Extraction Technique, windowed variant).
 *
 * 1. Repeating model: for each STFT frame and bin, the median magnitude across up to 5 loop cycles
 *    (this one and two either side), capped at the frame's own magnitude.
 * 2. Soft mask for the live part: 1 − model / magnitude.
 * 3. The live residual is resynthesised (masked complex STFT, inverse FFT, overlap-add), so the
 *    normal onset detector and clarity analyser can run on it unchanged.
 * 4. Cycles where the repeating part's share of the energy jumps are reported as changes
 *    (an overdub, or the loop stopping/restarting).
 */
import { AUDIO } from '../config/thresholds';
import type { Spectrogram } from '../dsp';
import { fftInPlace } from '../dsp/fft';

export interface SeparationResult {
  /** The live playing, as audio (same length as the input). */
  residual: Float32Array;
  /** Share of the mix's energy left in the residual, 0..1. */
  liveShare: number;
  /** Time ranges where the loop changed. */
  changedRanges: [number, number][];
}

const CYCLES_EACH_SIDE = 2;

function median(values: Float32Array, n: number): number {
  // n ≤ 5: insertion sort is fastest.
  for (let i = 1; i < n; i++) {
    const v = values[i]!;
    let j = i - 1;
    while (j >= 0 && values[j]! > v) {
      values[j + 1] = values[j]!;
      j--;
    }
    values[j + 1] = v;
  }
  return n % 2 ? values[n >> 1]! : (values[(n >> 1) - 1]! + values[n >> 1]!) / 2;
}

export function separateLoop(samples: Float32Array, spec: Spectrogram, loopMs: number): SeparationResult {
  const { frames, bins, data, windowSize: W, hopSize: H } = spec;
  const loopSamples = (loopMs / 1000) * AUDIO.sampleRate;
  const offsets: number[] = [];
  for (let j = -CYCLES_EACH_SIDE; j <= CYCLES_EACH_SIDE; j++) offsets.push(Math.round((j * loopSamples) / H));

  // 1–2. Repeating model → per-frame, per-bin live mask.
  const mask = new Float32Array(frames * bins);
  const buf = new Float32Array(offsets.length);
  for (let t = 0; t < frames; t++) {
    for (let f = 0; f < bins; f++) {
      let n = 0;
      for (const off of offsets) {
        const u = t + off;
        if (u >= 0 && u < frames) buf[n++] = data[u * bins + f]!;
      }
      const mag = data[t * bins + f]!;
      if (n < 2 || mag <= 0) {
        mask[t * bins + f] = 1;
        continue;
      }
      const model = Math.min(median(buf, n), mag);
      mask[t * bins + f] = 1 - model / mag;
    }
  }

  // 3. Resynthesis by overlap-add with a Hann synthesis window, normalised by Σ window².
  const residual = new Float32Array(samples.length);
  const norm = new Float32Array(samples.length);
  const win = Float64Array.from({ length: W }, (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (W - 1)));
  const re = new Float64Array(W);
  const im = new Float64Array(W);
  for (let t = 0; t < frames; t++) {
    const off = t * H;
    for (let i = 0; i < W; i++) {
      re[i] = samples[off + i]! * win[i]!;
      im[i] = 0;
    }
    fftInPlace(re, im);
    const row = t * bins;
    for (let f = 0; f < bins; f++) {
      const m = mask[row + f]!;
      re[f] = re[f]! * m;
      im[f] = im[f]! * m;
      if (f > 0 && f < W / 2) {
        // Keep the spectrum conjugate-symmetric so the result is real.
        re[W - f] = re[f]!;
        im[W - f] = -im[f]!;
      }
    }
    // Inverse FFT: conj → FFT → conj, / W.
    for (let i = 0; i < W; i++) im[i] = -im[i]!;
    fftInPlace(re, im);
    for (let i = 0; i < W; i++) {
      residual[off + i]! += ((re[i]! / W) * win[i]!);
      norm[off + i]! += win[i]! * win[i]!;
    }
  }
  let eMix = 0,
    eLive = 0;
  for (let i = 0; i < residual.length; i++) {
    if (norm[i]! > 1e-6) residual[i]! /= norm[i]!;
    eMix += samples[i]! * samples[i]!;
    eLive += residual[i]! * residual[i]!;
  }

  // 4. Changes: the repeating part's share per cycle.
  const framesPerCycle = Math.max(1, Math.round(loopSamples / H));
  const shares: number[] = [];
  for (let c = 0; c * framesPerCycle < frames; c++) {
    let rep = 0,
      all = 0;
    for (let t = c * framesPerCycle; t < Math.min(frames, (c + 1) * framesPerCycle); t++) {
      for (let f = 0; f < bins; f++) {
        const mag = data[t * bins + f]!;
        const r = mag * (1 - mask[t * bins + f]!);
        rep += r * r;
        all += mag * mag;
      }
    }
    shares.push(all > 0 ? rep / all : 0);
  }
  const changedRanges: [number, number][] = [];
  const cycleMs = loopMs;
  for (let c = 1; c < shares.length; c++) {
    if (Math.abs(shares[c]! - shares[c - 1]!) > 0.25) {
      changedRanges.push([Math.round((c - 1) * cycleMs), Math.round(Math.min((c + 1) * cycleMs, (samples.length / AUDIO.sampleRate) * 1000))]);
    }
  }

  return { residual, liveShare: eMix > 0 ? Math.min(1, eLive / eMix) : 0, changedRanges };
}

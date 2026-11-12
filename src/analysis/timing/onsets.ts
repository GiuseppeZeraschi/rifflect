/**
 * Onset detection (tasks.md T042, research.md R6):
 * 1. Log-magnitude STFT (1024 / 256), spectral flux in 80 Hz – 1.5 kHz, adaptive median peak picking.
 * 2. Each picked frame is refined in the time domain: within the frame's neighbourhood, the onset is
 *    placed at the steepest rise in short-block (~2.9 ms) energy. This brings precision from one
 *    hop (~11.6 ms) to a few ms, which timing feedback needs.
 */
import { AUDIO, ONSETS } from '../config/thresholds';
import { defaultDsp, frameTimeMs, type Dsp, type Spectrogram } from '../dsp';
import { activeFraction, pickPeaks, spectralFlux } from '../dsp/flux';

export interface OnsetResult {
  onsetsMs: number[];
  /** Spectral-flux onset strength, one value per STFT frame. */
  envelope: Float32Array;
  /** Envelope sample rate (frames per second). */
  envelopeRate: number;
  /** Fraction of onset-active frames (no-playing check). */
  activeFraction: number;
  spec: Spectrogram;
}

const BLOCK = 64; // samples per energy block (~2.9 ms)

function refineOnset(samples: Float32Array, approxMs: number, sr: number): number {
  const centre = Math.round((approxMs / 1000) * sr);
  const from = Math.max(BLOCK, centre - Math.round(0.045 * sr));
  const to = Math.min(samples.length - BLOCK, centre + Math.round(0.03 * sr));
  let bestRise = -Infinity;
  let best = centre;
  let prev = -1;
  for (let s = from; s <= to; s += BLOCK / 4) {
    let e = 0;
    for (let i = 0; i < BLOCK; i++) e += samples[s + i]! * samples[s + i]!;
    if (prev >= 0) {
      // Ratio-style rise is robust to the level of the previous note's tail.
      const rise = (e - prev) / (prev + 1e-6 + e * 0.05);
      if (rise > bestRise) {
        bestRise = rise;
        best = s;
      }
    }
    prev = e;
  }
  return (best / sr) * 1000;
}

/** Energy in [fromMs, toMs). */
function energy(samples: Float32Array, fromMs: number, toMs: number, sr: number): number {
  const a = Math.max(0, Math.round((fromMs / 1000) * sr));
  const b = Math.min(samples.length, Math.round((toMs / 1000) * sr));
  let e = 0;
  for (let i = a; i < b; i++) e += samples[i]! * samples[i]!;
  return e / Math.max(1, b - a);
}

/**
 * A real onset makes the sound louder. Flux peaks where the spectrum merely changes shape while the
 * note fades (common shortly after a pluck) fail this check.
 */
function isEnergyRise(samples: Float32Array, tMs: number, sr: number): boolean {
  const before = energy(samples, tMs - ONSETS.energyWindowMs, tMs - 2, sr);
  const after = energy(samples, tMs, tMs + ONSETS.energyWindowMs, sr);
  return after > before * ONSETS.minEnergyRise + 1e-9;
}

export function detectOnsets(samples: Float32Array, dsp: Dsp = defaultDsp): OnsetResult {
  const sr = AUDIO.sampleRate;
  const spec = dsp.stft(samples, { windowSize: AUDIO.windowSize, hopSize: AUDIO.hopSize, sampleRate: sr });
  const envelope = spectralFlux(spec, { lowHz: AUDIO.onsetBandLowHz, highHz: AUDIO.onsetBandHighHz });
  const hopMs = (AUDIO.hopSize / sr) * 1000;
  const peaks = pickPeaks(envelope, {
    medianWindow: ONSETS.medianWindowFrames,
    factor: ONSETS.thresholdFactor,
    offset: ONSETS.thresholdOffset,
    minGapFrames: Math.max(1, Math.round(ONSETS.minInterOnsetMs / hopMs)),
  });
  const onsetsMs: number[] = [];
  for (const f of peaks) {
    // The flux rises as the onset enters the window; the frame centre is a late estimate.
    const approx = frameTimeMs(spec, f) - hopMs;
    const refined = refineOnset(samples, approx, sr);
    if (!isEnergyRise(samples, refined, sr)) continue;
    const last = onsetsMs[onsetsMs.length - 1];
    if (last === undefined || refined - last >= ONSETS.minInterOnsetMs) onsetsMs.push(refined);
  }
  return {
    onsetsMs,
    envelope,
    envelopeRate: sr / AUDIO.hopSize,
    activeFraction: activeFraction(envelope),
    spec,
  };
}

import { fftInPlace } from './fft';

/** Magnitude spectrogram, row-major: data[frame * bins + bin]. */
export interface Spectrogram {
  frames: number;
  /** windowSize / 2 + 1 */
  bins: number;
  data: Float32Array;
  windowSize: number;
  hopSize: number;
  sampleRate: number;
}

export interface StftOptions {
  windowSize: number;
  hopSize: number;
  sampleRate: number;
}

const hannCache = new Map<number, Float64Array>();
function hann(n: number): Float64Array {
  let w = hannCache.get(n);
  if (!w) {
    w = new Float64Array(n);
    for (let i = 0; i < n; i++) w[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1));
    hannCache.set(n, w);
  }
  return w;
}

/**
 * Hann-windowed STFT magnitudes, no centre padding: frame f covers samples [f·hop, f·hop + window).
 * Frames = 1 + floor((len − window) / hop), or 0 if the signal is shorter than one window.
 */
export function stft(samples: Float32Array, { windowSize, hopSize, sampleRate }: StftOptions): Spectrogram {
  const bins = windowSize / 2 + 1;
  const frames = samples.length < windowSize ? 0 : 1 + Math.floor((samples.length - windowSize) / hopSize);
  const data = new Float32Array(frames * bins);
  const w = hann(windowSize);
  const re = new Float64Array(windowSize);
  const im = new Float64Array(windowSize);
  for (let f = 0; f < frames; f++) {
    const off = f * hopSize;
    for (let i = 0; i < windowSize; i++) {
      re[i] = samples[off + i]! * w[i]!;
      im[i] = 0;
    }
    fftInPlace(re, im);
    const row = f * bins;
    for (let b = 0; b < bins; b++) data[row + b] = Math.hypot(re[b]!, im[b]!);
  }
  return { frames, bins, data, windowSize, hopSize, sampleRate };
}

/** Bin index for a frequency (Hz), clamped to the spectrogram. */
export function binOf(spec: Pick<Spectrogram, 'windowSize' | 'sampleRate' | 'bins'>, hz: number): number {
  return Math.min(spec.bins - 1, Math.max(0, Math.round((hz * spec.windowSize) / spec.sampleRate)));
}

/** Time (ms) of a frame's centre. */
export function frameTimeMs(spec: Pick<Spectrogram, 'hopSize' | 'windowSize' | 'sampleRate'>, frame: number): number {
  return ((frame * spec.hopSize + spec.windowSize / 2) / spec.sampleRate) * 1000;
}

/** Nearest frame whose centre is at or after `ms`. */
export function frameAtMs(spec: Pick<Spectrogram, 'hopSize' | 'windowSize' | 'sampleRate' | 'frames'>, ms: number): number {
  const f = Math.round(((ms / 1000) * spec.sampleRate - spec.windowSize / 2) / spec.hopSize);
  return Math.min(Math.max(0, f), Math.max(0, spec.frames - 1));
}

import type { Spectrogram } from './stft';

/** 12-bin pitch-class profile per frame (C=0 … B=11), each frame L2-normalised. Row-major. */
export interface Chromagram {
  frames: number;
  data: Float32Array;
}

/** Map each bin (55 Hz – 5 kHz) to its nearest pitch class and sum magnitudes. */
export function chromagram(spec: Spectrogram, { minHz = 55, maxHz = 5000 } = {}): Chromagram {
  const classOf = new Int8Array(spec.bins).fill(-1);
  for (let b = 1; b < spec.bins; b++) {
    const hz = (b * spec.sampleRate) / spec.windowSize;
    if (hz < minHz || hz > maxHz) continue;
    const midi = 69 + 12 * Math.log2(hz / 440);
    classOf[b] = ((Math.round(midi) % 12) + 12) % 12;
  }
  const data = new Float32Array(spec.frames * 12);
  for (let f = 0; f < spec.frames; f++) {
    const row = f * spec.bins;
    const out = f * 12;
    for (let b = 1; b < spec.bins; b++) {
      const c = classOf[b]!;
      if (c >= 0) data[out + c] = data[out + c]! + spec.data[row + b]!;
    }
    let norm = 0;
    for (let c = 0; c < 12; c++) norm += data[out + c]! * data[out + c]!;
    norm = Math.sqrt(norm) || 1;
    for (let c = 0; c < 12; c++) data[out + c]! /= norm;
  }
  return { frames: spec.frames, data };
}

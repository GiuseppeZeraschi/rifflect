/**
 * DSP behind one interface (research.md R5): the hot loops can be swapped for a C++/JSI
 * implementation (Nitro) if on-device benchmarks miss the budget, without touching the analysers.
 * The TypeScript implementation stays the default in Node and Jest.
 */
import { autocorrelate } from './autocorr';
import { fftReal } from './fft';
import { stft, type Spectrogram, type StftOptions } from './stft';

export interface Dsp {
  fft(input: Float64Array): { re: Float64Array; im: Float64Array };
  stft(samples: Float32Array, opts: StftOptions): Spectrogram;
  autocorrelate(x: Float32Array, maxLag: number): Float32Array;
}

export const defaultDsp: Dsp = { fft: fftReal, stft, autocorrelate };

export type { Spectrogram, StftOptions } from './stft';
export { binOf, frameAtMs, frameTimeMs } from './stft';

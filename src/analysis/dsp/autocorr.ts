/**
 * Normalised autocorrelation of a (mean-removed) signal for lags 0..maxLag, via FFT
 * (zero-padded to avoid circular wrap). ac[0] = 1.
 */
import { fftInPlace } from './fft';

export function autocorrelate(x: Float32Array, maxLag: number): Float32Array {
  const n = x.length;
  const lags = Math.min(maxLag, n - 1);
  let size = 1;
  while (size < 2 * n) size <<= 1;
  let mean = 0;
  for (let i = 0; i < n; i++) mean += x[i]!;
  mean /= Math.max(1, n);
  const re = new Float64Array(size);
  const im = new Float64Array(size);
  for (let i = 0; i < n; i++) re[i] = x[i]! - mean;
  fftInPlace(re, im);
  for (let i = 0; i < size; i++) {
    re[i] = re[i]! * re[i]! + im[i]! * im[i]!;
    im[i] = 0;
  }
  // Inverse FFT via conjugation: ifft(X) = conj(fft(conj(X))) / N; the power spectrum is real.
  fftInPlace(re, im);
  const out = new Float32Array(lags + 1);
  const zero = re[0]! || 1;
  for (let lag = 0; lag <= lags; lag++) out[lag] = re[lag]! / zero;
  return out;
}

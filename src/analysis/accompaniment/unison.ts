/**
 * Unison with the loop (spec edge case; limitation `unison_with_accompaniment`).
 *
 * When the player plays the loop's own notes at the loop's own moments, their notes can't be told
 * apart from the loop. A live onset is "in unison" when a loop onset falls within ±30 ms AND the
 * live part's spectrum just after it closely matches the loop's (same pitches, not just the same
 * rhythm). A run of such onsets spanning ≥ 1.5 s is reported, and those onsets are left out of
 * the timing judgement.
 */
import { AUDIO } from '../config/thresholds';
import { fftInPlace } from '../dsp/fft';
import type { Range } from '../technique/hands';

const SR = AUDIO.sampleRate;
const N = 2048;
const hann = Float64Array.from({ length: N }, (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (N - 1)));

/** Log-magnitude spectrum (80 Hz – 2 kHz) of the window starting at `ms`. */
function spectrum(x: Float32Array, ms: number): Float64Array | null {
  const from = Math.round((ms / 1000) * SR);
  if (from < 0 || from + N > x.length) return null;
  const re = new Float64Array(N);
  const im = new Float64Array(N);
  for (let i = 0; i < N; i++) re[i] = x[from + i]! * hann[i]!;
  fftInPlace(re, im);
  const lo = Math.round((80 * N) / SR);
  const hi = Math.round((2000 * N) / SR);
  const out = new Float64Array(hi - lo);
  for (let k = lo; k < hi; k++) out[k - lo] = Math.log1p(100 * Math.hypot(re[k]!, im[k]!));
  return out;
}

function cosine(a: Float64Array, b: Float64Array): number {
  let ab = 0,
    aa = 0,
    bb = 0;
  for (let i = 0; i < a.length; i++) {
    ab += a[i]! * b[i]!;
    aa += a[i]! * a[i]!;
    bb += b[i]! * b[i]!;
  }
  return aa > 0 && bb > 0 ? ab / Math.sqrt(aa * bb) : 0;
}

export function findUnison(
  liveOnsetsMs: number[],
  accOnsetsMs: number[],
  live: Float32Array,
  repeating: Float32Array,
): { ranges: Range[]; unisonOnsets: Set<number> } {
  const flagged = liveOnsetsMs.map((t) => {
    if (!accOnsetsMs.some((a) => Math.abs(a - t) <= 30)) return false;
    const s1 = spectrum(live, t + 40);
    const s2 = spectrum(repeating, t + 40);
    return !!s1 && !!s2 && cosine(s1, s2) >= 0.9;
  });
  const ranges: Range[] = [];
  const unisonOnsets = new Set<number>();
  let start = -1;
  for (let i = 0; i <= liveOnsetsMs.length; i++) {
    if (i < liveOnsetsMs.length && flagged[i]) {
      if (start < 0) start = i;
      continue;
    }
    if (start >= 0) {
      const from = liveOnsetsMs[start]!;
      const to = liveOnsetsMs[i - 1]!;
      if (i - start >= 4 && to - from >= 1500) {
        ranges.push([Math.round(from), Math.round(to)]);
        for (let k = start; k < i; k++) unisonOnsets.add(liveOnsetsMs[k]!);
      }
      start = -1;
    }
  }
  return { ranges, unisonOnsets };
}

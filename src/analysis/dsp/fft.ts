/**
 * Iterative radix-2 complex FFT (in place on Float64Arrays). Twiddles and bit-reversal tables are
 * cached per size, since the engine runs thousands of same-size transforms per take.
 */

interface Plan {
  n: number;
  cos: Float64Array;
  sin: Float64Array;
  rev: Uint32Array;
}

const plans = new Map<number, Plan>();

function plan(n: number): Plan {
  let p = plans.get(n);
  if (p) return p;
  if (n < 2 || (n & (n - 1)) !== 0) throw new Error(`FFT size must be a power of two, got ${n}`);
  const half = n / 2;
  const cos = new Float64Array(half);
  const sin = new Float64Array(half);
  for (let i = 0; i < half; i++) {
    cos[i] = Math.cos((2 * Math.PI * i) / n);
    sin[i] = -Math.sin((2 * Math.PI * i) / n);
  }
  const bits = Math.log2(n);
  const rev = new Uint32Array(n);
  for (let i = 0; i < n; i++) {
    let r = 0;
    for (let b = 0; b < bits; b++) r |= ((i >> b) & 1) << (bits - 1 - b);
    rev[i] = r;
  }
  p = { n, cos, sin, rev };
  plans.set(n, p);
  return p;
}

/** In-place complex FFT. `re` and `im` must have the same power-of-two length. */
export function fftInPlace(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  const { cos, sin, rev } = plan(n);
  for (let i = 0; i < n; i++) {
    const j = rev[i]!;
    if (j > i) {
      let t = re[i]!;
      re[i] = re[j]!;
      re[j] = t;
      t = im[i]!;
      im[i] = im[j]!;
      im[j] = t;
    }
  }
  for (let size = 2; size <= n; size <<= 1) {
    const halfSize = size >> 1;
    const step = n / size;
    for (let start = 0; start < n; start += size) {
      for (let k = 0; k < halfSize; k++) {
        const wr = cos[k * step]!;
        const wi = sin[k * step]!;
        const a = start + k;
        const b = a + halfSize;
        const xr = re[b]! * wr - im[b]! * wi;
        const xi = re[b]! * wi + im[b]! * wr;
        re[b] = re[a]! - xr;
        im[b] = im[a]! - xi;
        re[a] = re[a]! + xr;
        im[a] = im[a]! + xi;
      }
    }
  }
}

/** FFT of a real signal. Returns the full complex spectrum (length n). */
export function fftReal(input: Float64Array): { re: Float64Array; im: Float64Array } {
  const re = Float64Array.from(input);
  const im = new Float64Array(input.length);
  fftInPlace(re, im);
  return { re, im };
}

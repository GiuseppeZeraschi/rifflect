import { defaultDsp } from '@/analysis/dsp';
import { spectralFlux, pickPeaks } from '@/analysis/dsp/flux';
import { chromagram } from '@/analysis/dsp/chroma';
import { onsetTrain, rng, sine, SR } from '../../helpers/synth';

function naiveDft(x: Float64Array) {
  const n = x.length;
  const re = new Float64Array(n);
  const im = new Float64Array(n);
  for (let k = 0; k < n; k++) {
    let sr = 0,
      si = 0;
    for (let t = 0; t < n; t++) {
      const a = (-2 * Math.PI * k * t) / n;
      sr += x[t]! * Math.cos(a);
      si += x[t]! * Math.sin(a);
    }
    re[k] = sr;
    im[k] = si;
  }
  return { re, im };
}

describe('FFT', () => {
  it.each([256, 1024, 2048])('matches a naive DFT for N=%i', (n) => {
    const r = rng(n);
    const x = new Float64Array(n).map(() => r() * 2 - 1);
    const ref = naiveDft(x);
    const out = defaultDsp.fft(Float64Array.from(x));
    let maxErr = 0;
    for (let k = 0; k < n; k++) {
      maxErr = Math.max(maxErr, Math.abs(out.re[k]! - ref.re[k]!), Math.abs(out.im[k]! - ref.im[k]!));
    }
    // Errors relative to the input scale (DFT sums N terms of magnitude ≤ 1).
    expect(maxErr / n).toBeLessThan(1e-4);
  });

  it('rejects non-power-of-two sizes', () => {
    expect(() => defaultDsp.fft(new Float64Array(100))).toThrow();
  });
});

describe('STFT', () => {
  it('produces 1 + floor((len − window) / hop) frames of window/2 + 1 bins', () => {
    const x = new Float32Array(22050);
    const spec = defaultDsp.stft(x, { windowSize: 1024, hopSize: 256, sampleRate: SR });
    expect(spec.frames).toBe(1 + Math.floor((22050 - 1024) / 256));
    expect(spec.bins).toBe(513);
    expect(spec.data.length).toBe(spec.frames * spec.bins);
  });

  it('returns zero frames for a signal shorter than one window', () => {
    expect(defaultDsp.stft(new Float32Array(100), { windowSize: 1024, hopSize: 256, sampleRate: SR }).frames).toBe(0);
  });

  it('puts a sine’s energy in the right bin', () => {
    const spec = defaultDsp.stft(sine(1000, 500), { windowSize: 1024, hopSize: 256, sampleRate: SR });
    const frame = 5;
    let best = 0;
    for (let b = 1; b < spec.bins; b++) {
      if (spec.data[frame * spec.bins + b]! > spec.data[frame * spec.bins + best]!) best = b;
    }
    expect(best).toBe(Math.round((1000 * 1024) / SR));
  });
});

describe('spectral flux onsets', () => {
  it('peaks within ±1 hop of synthetic onsets', () => {
    const { samples, onsetsMs } = onsetTrain({ bpm: 100, beats: 12 });
    const spec = defaultDsp.stft(samples, { windowSize: 1024, hopSize: 256, sampleRate: SR });
    const flux = spectralFlux(spec, { lowHz: 80, highHz: 1500 });
    const peaks = pickPeaks(flux, { medianWindow: 16, factor: 1.5, offset: 0.02, minGapFrames: 4 });
    const hopMs = (256 / SR) * 1000;
    // Flux frame f covers samples starting at f*hop; its centre is half a window later.
    const peakMs = peaks.map((f) => f * hopMs + ((1024 / 2) / SR) * 1000);
    for (const o of onsetsMs) {
      const nearest = Math.min(...peakMs.map((p) => Math.abs(p - o)));
      expect(nearest).toBeLessThanOrEqual(hopMs * 2);
    }
    expect(peaks.length).toBeLessThanOrEqual(onsetsMs.length + 2);
  });
});

describe('autocorrelation', () => {
  it('peaks at the known period', () => {
    const period = 37;
    const x = new Float32Array(2000);
    for (let i = 0; i < x.length; i += period) x[i] = 1;
    const ac = defaultDsp.autocorrelate(x, 200);
    let best = 10;
    for (let lag = 10; lag <= 200; lag++) if (ac[lag]! > ac[best]!) best = lag;
    expect(best).toBe(period);
    expect(ac[0]).toBeCloseTo(1, 6); // normalised
  });
});

describe('chroma', () => {
  it('maps A4 (440 Hz) to pitch class A', () => {
    const spec = defaultDsp.stft(sine(440, 500), { windowSize: 2048, hopSize: 512, sampleRate: SR });
    const chroma = chromagram(spec);
    const frame = Array.from(chroma.data.subarray(2 * 12, 3 * 12));
    expect(frame.indexOf(Math.max(...frame))).toBe(9); // C=0 … A=9
  });
});

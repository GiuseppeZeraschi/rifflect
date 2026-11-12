/**
 * Synthetic test signals at 22,050 Hz mono (tasks.md T029). Deterministic: every generator takes a
 * seed, so tests are reproducible. Times are in ms.
 */
export const SR = 22050;

/** Small deterministic PRNG (mulberry32). Returns values in [0, 1). */
export function rng(seed = 1): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const msToSamples = (ms: number) => Math.round((ms / 1000) * SR);

export function silence(durationMs: number): Float32Array {
  return new Float32Array(msToSamples(durationMs));
}

export interface PluckOptions {
  /** Fundamental frequency (Hz). */
  freq?: number;
  /** Seconds for the note to decay by 60 dB. Guitar-like ≈ 1.5–3 s; muted ≈ 0.08 s. */
  decayS?: number;
  /** Peak amplitude. */
  amp?: number;
  /** Note length (ms) before it is cut. */
  lengthMs?: number;
  seed?: number;
}

/** Karplus–Strong plucked string. */
export function pluck({ freq = 196, decayS = 2, amp = 0.5, lengthMs = 600, seed = 1 }: PluckOptions = {}) {
  const n = msToSamples(lengthMs);
  const out = new Float32Array(n);
  const period = Math.max(2, Math.round(SR / freq));
  const r = rng(seed);
  const buf = new Float64Array(period);
  for (let i = 0; i < period; i++) buf[i] = r() * 2 - 1;
  // Each buffer slot is attenuated once per period (i.e. freq times per second), so the loss per
  // pass that makes the amplitude fall 60 dB in decayS seconds is 10^(−3 / (decayS · freq)).
  const loss = Math.pow(10, -3 / (decayS * (SR / period)));
  let idx = 0;
  for (let i = 0; i < n; i++) {
    const next = (idx + 1) % period;
    const v = 0.5 * (buf[idx]! + buf[next]!) * loss;
    out[i] = buf[idx]! * amp;
    buf[idx] = v;
    idx = next;
  }
  return out;
}

/** Add `src` into `dst` starting at `atMs` (clipped to dst length). */
export function mixAt(dst: Float32Array, src: Float32Array, atMs: number, gain = 1) {
  const start = msToSamples(atMs);
  for (let i = 0; i < src.length && start + i < dst.length; i++) {
    if (start + i >= 0) dst[start + i]! += src[i]! * gain;
  }
  return dst;
}

/** Onset times (ms) for `count` beats at `bpm`, starting at `startMs`. */
export function beatTimes(bpm: number, count: number, startMs = 500): number[] {
  const beatMs = 60000 / bpm;
  return Array.from({ length: count }, (_, i) => startMs + i * beatMs);
}

export interface TrainOptions {
  bpm: number;
  beats: number;
  startMs?: number;
  /** Gaussian-ish random timing jitter, standard deviation in ms. */
  jitterMs?: number;
  /** Constant offset (ms) applied to every beat at this position in the bar (1-based); negative = early. */
  beatOffset?: { beat: number; beatsPerBar: number; offsetMs: number };
  /** Linear tempo change over the train: final BPM = bpm + driftBpm. */
  driftBpm?: number;
  pluck?: PluckOptions;
  seed?: number;
}

/** Plucked notes on a beat grid; returns the signal and the true onset times (ms). */
export function onsetTrain(opts: TrainOptions): { samples: Float32Array; onsetsMs: number[] } {
  const { bpm, beats, startMs = 500, jitterMs = 0, driftBpm = 0, seed = 7 } = opts;
  const r = rng(seed);
  const gauss = () => (r() + r() + r() + r() - 2) * 1.73; // ~N(0,1)
  const onsetsMs: number[] = [];
  let t = startMs;
  for (let i = 0; i < beats; i++) {
    let onset = t + gauss() * jitterMs;
    if (opts.beatOffset && (i % opts.beatOffset.beatsPerBar) + 1 === opts.beatOffset.beat) {
      onset += opts.beatOffset.offsetMs;
    }
    onsetsMs.push(onset);
    const localBpm = bpm + (driftBpm * i) / Math.max(1, beats - 1);
    t += 60000 / localBpm;
  }
  const totalMs = (onsetsMs[onsetsMs.length - 1] ?? startMs) + 1500;
  const samples = silence(totalMs);
  const freqs = [196, 247, 294, 330];
  onsetsMs.forEach((o, i) =>
    mixAt(samples, pluck({ freq: freqs[i % freqs.length], seed: seed + i, ...opts.pluck }), o),
  );
  return { samples, onsetsMs };
}

/** White noise at a given RMS. */
export function whiteNoise(durationMs: number, rms = 0.05, seed = 3): Float32Array {
  const r = rng(seed);
  const out = new Float32Array(msToSamples(durationMs));
  const scale = rms * Math.sqrt(3); // uniform [-a, a] has RMS a/√3
  for (let i = 0; i < out.length; i++) out[i] = (r() * 2 - 1) * scale;
  return out;
}

/** Pink-ish noise (Paul Kellet's economy filter) at a given RMS. */
export function pinkNoise(durationMs: number, rms = 0.05, seed = 4): Float32Array {
  const white = whiteNoise(durationMs, 1, seed);
  const out = new Float32Array(white.length);
  let b0 = 0,
    b1 = 0,
    b2 = 0;
  for (let i = 0; i < white.length; i++) {
    const w = white[i]!;
    b0 = 0.99765 * b0 + w * 0.099046;
    b1 = 0.963 * b1 + w * 0.2965164;
    b2 = 0.57 * b2 + w * 1.0526913;
    out[i] = b0 + b1 + b2 + w * 0.1848;
  }
  return normaliseRms(out, rms);
}

export function rmsOf(x: Float32Array): number {
  let s = 0;
  for (let i = 0; i < x.length; i++) s += x[i]! * x[i]!;
  return Math.sqrt(s / Math.max(1, x.length));
}

export function normaliseRms(x: Float32Array, rms: number): Float32Array {
  const cur = rmsOf(x) || 1;
  for (let i = 0; i < x.length; i++) x[i]! *= rms / cur;
  return x;
}

/** Add noise to a signal at a given signal-to-noise ratio (dB). */
export function addNoise(signal: Float32Array, snrDb: number, kind: 'white' | 'pink' = 'white', seed = 5) {
  const ms = (signal.length / SR) * 1000;
  const noiseRms = rmsOf(signal) / Math.pow(10, snrDb / 20);
  const noise = kind === 'white' ? whiteNoise(ms, noiseRms, seed) : pinkNoise(ms, noiseRms, seed);
  const out = new Float32Array(signal.length);
  for (let i = 0; i < out.length; i++) out[i] = signal[i]! + (noise[i] ?? 0);
  return out;
}

/** A fret-buzz-like burst: broadband high-frequency rattle for `lengthMs`, decaying quickly. */
export function buzzBurst(lengthMs = 120, amp = 0.15, seed = 9): Float32Array {
  const r = rng(seed);
  const out = new Float32Array(msToSamples(lengthMs));
  let prev = 0;
  for (let i = 0; i < out.length; i++) {
    const w = r() * 2 - 1;
    const hp = w - prev; // crude high-pass
    prev = w;
    // Rattle: amplitude-modulated at ~110 Hz, decaying.
    const env = Math.exp(-i / (0.04 * SR)) * (0.6 + 0.4 * Math.sin((2 * Math.PI * 110 * i) / SR));
    out[i] = hp * amp * env;
  }
  return out;
}

/** A muted (palm-muted / dead) note: decays ~25× faster than a ringing note. */
export function mutedNote(freq = 196, seed = 11): Float32Array {
  return pluck({ freq, decayS: 0.08, lengthMs: 300, seed });
}

/**
 * Speech-like signal with no pitched, percussive onsets: band-limited noise with slow (~4 Hz)
 * syllable-rate amplitude modulation and soft attacks.
 */
export function speechLike(durationMs: number, rms = 0.1, seed = 13): Float32Array {
  const pink = pinkNoise(durationMs, 1, seed);
  const out = new Float32Array(pink.length);
  // Low-pass to ~1 kHz and modulate with a smooth envelope.
  let lp = 0;
  const a = Math.exp((-2 * Math.PI * 1000) / SR);
  for (let i = 0; i < pink.length; i++) {
    lp = a * lp + (1 - a) * pink[i]!;
    const tS = i / SR;
    const env = 0.5 * (1 - Math.cos(2 * Math.PI * 4 * tS)) * (0.7 + 0.3 * Math.sin(2 * Math.PI * 0.7 * tS));
    out[i] = lp * env;
  }
  return normaliseRms(out, rms);
}

/** Sine tone, for DSP tests. */
export function sine(freq: number, durationMs: number, amp = 0.5): Float32Array {
  const out = new Float32Array(msToSamples(durationMs));
  for (let i = 0; i < out.length; i++) out[i] = amp * Math.sin((2 * Math.PI * freq * i) / SR);
  return out;
}

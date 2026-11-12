/**
 * Note clarity from audio (tasks.md T048, research.md R7):
 * - fret buzz: unusually high high-frequency energy just after an onset (relative to this take);
 * - muted / dead notes: energy collapses within ~200 ms;
 * - unwanted open strings: low open-string fundamentals ringing under higher notes;
 * - clean: none of the above across enough notes.
 *
 * With accompaniment (US4) the caller passes the separated live signal and a per-onset live
 * confidence; onsets below TECHNIQUE.liveClarityConfidence are ignored (contract guarantee 10).
 */
import { AUDIO, TECHNIQUE } from '../config/thresholds';
import { defaultDsp, type Dsp } from '../dsp';
import type { Finding } from '../types';

const SR = AUDIO.sampleRate;
const toS = (ms: number) => Math.round((ms / 1000) * SR);

function energy(x: Float32Array, fromMs: number, toMs: number): number {
  const a = Math.max(0, toS(fromMs));
  const b = Math.min(x.length, toS(toMs));
  let e = 0;
  for (let i = a; i < b; i++) e += x[i]! * x[i]!;
  return e / Math.max(1, b - a);
}

/** Share of energy in the second difference (a crude > ~4 kHz emphasis) over [from, to). */
export function highFrequencyRatio(x: Float32Array, fromMs: number, toMs: number): number {
  const a = Math.max(2, toS(fromMs));
  const b = Math.min(x.length, toS(toMs));
  let hf = 0,
    all = 0;
  for (let i = a; i < b; i++) {
    const d2 = x[i]! - 2 * x[i - 1]! + x[i - 2]!;
    hf += d2 * d2;
    all += x[i]! * x[i]!;
  }
  return all > 0 ? hf / all : 0;
}

const OPEN_STRING_HZ = [82.41, 110.0, 146.83];

/** Does a low open-string fundamental ring strongly under a higher note? */
function openStringRinging(x: Float32Array, onsetMs: number, dsp: Dsp): boolean {
  const start = toS(onsetMs + 100);
  const n = 4096;
  if (start + n > x.length) return false;
  const frame = new Float64Array(n);
  for (let i = 0; i < n; i++) frame[i] = x[start + i]! * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1)));
  const { re, im } = dsp.fft(frame);
  const mag = (hz: number) => {
    const b = Math.round((hz * n) / SR);
    let m = 0;
    for (let k = b - 1; k <= b + 1; k++) m = Math.max(m, Math.hypot(re[k]!, im[k]!));
    return m;
  };
  let mainHz = 0,
    mainMag = 0;
  for (let k = Math.round((150 * n) / SR); k < Math.round((1000 * n) / SR); k++) {
    const m = Math.hypot(re[k]!, im[k]!);
    if (m > mainMag) {
      mainMag = m;
      mainHz = (k * SR) / n;
    }
  }
  if (mainMag === 0 || mainHz < 150) return false;
  // A low peak that isn't a subharmonic artefact of the played note.
  return OPEN_STRING_HZ.some((hz) => Math.abs(mainHz / hz - Math.round(mainHz / hz)) > 0.08 && mag(hz) > 0.5 * mainMag);
}

/**
 * How clarity is judged when something else is playing (US4, research.md R16):
 * - loop: buzz is measured on the mix as the excess over the same point in the other loop cycles,
 *   so a buzz recorded into the loop (present every cycle) cancels out;
 * - click: the buzz window starts after the click has died away;
 * - backing: hi-hats look like buzz, so buzz isn't judged.
 * Muted notes and open strings can't be attributed while the accompaniment keeps sounding, so they
 * are only judged for solo takes (a missed issue beats a false one).
 */
export type ClarityContext = { kind: 'solo' } | { kind: 'loop'; loopMs: number } | { kind: 'click' } | { kind: 'backing' };

export interface ClarityOptions {
  /** Per-onset confidence that the onset is live playing (US4). Defaults to 1 for all. */
  liveConfidence?: number[];
  context?: ClarityContext;
  dsp?: Dsp;
}

export function analyseClarity(samples: Float32Array, onsetsMs: number[], opts: ClarityOptions = {}): Finding[] {
  const dsp = opts.dsp ?? defaultDsp;
  const ctx = opts.context ?? { kind: 'solo' };
  const durationMs = (samples.length / SR) * 1000;
  const usable = onsetsMs
    .map((t, i) => ({ t, i, next: onsetsMs[i + 1] ?? Infinity }))
    .filter(({ i }) => (opts.liveConfidence?.[i] ?? 1) >= TECHNIQUE.liveClarityConfidence);
  // Same minimum as the no-playing check, so an analysed take always gets a clarity point.
  if (usable.length < 4) return [];

  const buzzFrom = ctx.kind === 'click' ? 20 : 5;
  const hfAt = (t: number, next: number) => highFrequencyRatio(samples, t + buzzFrom, Math.min(t + 80, next - 5));
  let hf = usable.map(({ t, next }) => hfAt(t, next));
  const rawSorted = [...hf].sort((a, b) => a - b);
  const medianRaw = rawSorted[rawSorted.length >> 1]!;
  if (ctx.kind === 'loop') {
    // Subtract the brightest the same point gets in the other cycles: a buzz recorded into the loop is
    // in every cycle (so it cancels), and normal note-to-note variation mostly stays below the maximum.
    hf = usable.map(({ t, next }, k) => {
      const others: number[] = [];
      for (const j of [-2, -1, 1, 2]) {
        const u = t + j * ctx.loopMs;
        if (u > 0 && u + 80 < durationMs) others.push(hfAt(u, u + (next - t)));
      }
      const loopPart = others.length ? Math.max(...others) : 0;
      return Math.max(0, hf[k]! - loopPart);
    });
  }
  const sortedHf = [...hf].sort((a, b) => a - b);
  const medianHf = sortedHf[sortedHf.length >> 1]!;
  let buzzThreshold = Math.max(medianHf * 3, 1e-6, 0.02);
  if (ctx.kind === 'loop') {
    // Only a clear outlier counts: the excess must be several times how bright notes normally are
    // in this take (and not less than 0.5).
    buzzThreshold = Math.max(3 * medianRaw, 0.5);
  }
  const buzzy = ctx.kind === 'backing' ? [] : usable.filter((_, k) => hf[k]! > buzzThreshold);

  const solo = ctx.kind === 'solo';
  // Decay check only where the next onset is far enough away not to mask it.
  const decayable = solo ? usable.filter(({ t, next }) => next - t >= 300 && t + 260 <= durationMs) : [];
  const muted = decayable.filter(({ t }) => {
    const early = energy(samples, t + 20, t + 60);
    const late = energy(samples, t + 150, t + 250);
    return early > 0 && late / early < 0.02;
  });

  const open = solo ? usable.filter(({ t, next }) => next - t >= 400 && openStringRinging(samples, t, dsp)) : [];

  const out: Finding[] = [];
  const base = Math.min(0.9, 0.55 + usable.length / 60);
  const add = (issueCode: Finding['issueCode'], hits: { t: number }[], of: number) => {
    const share = hits.length / of;
    out.push({
      category: 'technique',
      aspect: 'clarity',
      issueCode,
      severity: share >= 0.3 ? 'moderate' : 'minor',
      confidence: Math.min(0.92, base + Math.min(0.2, hits.length / 30)),
      startMs: Math.round(hits[0]!.t),
      endMs: Math.round(hits[hits.length - 1]!.t),
      metrics: { count: hits.length, of, firstAtMs: Math.round(hits[0]!.t) },
    });
  };
  if (buzzy.length >= 2) add('technique.fret_buzz', buzzy, usable.length);
  if (muted.length >= 2) add('technique.muted_notes', muted, decayable.length);
  if (open.length >= 3 && open.length / usable.length >= 0.3) add('technique.unwanted_open_strings', open, usable.length);

  if (out.length === 0) {
    out.push({
      category: 'technique',
      aspect: 'clarity',
      issueCode: 'technique.clean',
      severity: 'info',
      confidence: base,
      startMs: Math.round(usable[0]!.t),
      endMs: Math.round(usable[usable.length - 1]!.t),
      // With accompaniment only buzz is judged (see ClarityContext), so "clean" means "no buzz".
      metrics: { notes: usable.length, checked: solo ? 'all' : 'buzz' },
    });
  }
  return out;
}

/**
 * Synthetic lead-over-accompaniment mixes with known ground truth (tasks.md T079).
 *
 * - lead: plucked notes at known times, higher register (330–660 Hz), with matching picking strokes
 * - loop: a rhythm part rendered once and tiled EXACTLY (as a looper does), at a gain relative to the lead
 * - overdub, click track, non-repeating backing, unison and loop-only variants
 */
import type { LandmarkFrame } from '@/analysis/types';
import { mixAt, msToSamples, pluck, rmsOf, rng, SR, buzzBurst } from './synth';
import { landmarkStream, strummingHand } from './synthLandmarks';

export interface MixOptions {
  durationMs?: number;
  bpm?: number;
  /** Loop length in ms (a whole number of beats). */
  loopMs?: number;
  /** Loop RMS relative to the lead RMS. */
  gain?: number;
  /** Lead onsets offset (ms) for bars [from, to] (1-based, 4/4 relative to the loop start). */
  leadOffset?: { fromBar: number; toBar: number; offsetMs: number };
  /** Add a fret-buzz burst to one note of the loop (so it repeats every cycle). */
  buzzInLoop?: boolean;
  /** Lead silent: only the loop plays. */
  loopOnly?: boolean;
  /** From halfway, an extra repeating layer joins the loop. */
  overdub?: boolean;
  /** Lead doubles the loop (identical notes) for these bars, instead of its own line. */
  unisonBars?: [number, number];
  seed?: number;
}

export interface Mix {
  samples: Float32Array;
  /** True live (lead) onsets. */
  leadOnsetsMs: number[];
  /** Accompaniment onsets (all cycles). */
  accOnsetsMs: number[];
  loopMs: number;
  beatMs: number;
  landmarks: LandmarkFrame[];
  durationMs: number;
}

/** Chord strum: low plucks a few ms apart. */
function strum(freqs: number[], seed: number, amp = 0.35): Float32Array {
  const out = new Float32Array(msToSamples(900));
  freqs.forEach((f, i) => mixAt(out, pluck({ freq: f, amp, decayS: 1.2, lengthMs: 850, seed: seed + i }), i * 8));
  return out;
}

function scale(x: Float32Array, gain: number): Float32Array {
  for (let i = 0; i < x.length; i++) x[i]! *= gain;
  return x;
}

/** Render one loop cycle: a strum on every beat, two alternating chords. */
function renderCycle(loopMs: number, beatMs: number, seed: number, buzz: boolean, layer = 0): { cycle: Float32Array; onsets: number[] } {
  const cycle = new Float32Array(msToSamples(loopMs));
  const onsets: number[] = [];
  const chords = layer === 0 ? [[110, 147, 196], [98, 147, 196]] : [[165, 220], [147, 196]];
  const beats = Math.round(loopMs / beatMs);
  for (let b = 0; b < beats; b++) {
    if (layer === 1 && b % 2 === 1) continue; // overdub plays half as often
    const t = b * beatMs + 20;
    onsets.push(t);
    mixAt(cycle, strum(chords[Math.floor(b / 4) % 2]!, seed + b * 7 + layer * 100), t);
    if (buzz && b === 1) mixAt(cycle, buzzBurst(120, 0.25, seed + 3), t + 5);
  }
  // Wrap tails that spill past the cycle end back to the start, as a looper's overdub buffer would.
  return { cycle, onsets };
}

function tile(dst: Float32Array, cycle: Float32Array, startSample = 0) {
  for (let i = startSample; i < dst.length; i++) dst[i]! += cycle[(i - startSample) % cycle.length]!;
}

export function leadOverLoop(o: MixOptions = {}): Mix {
  const durationMs = o.durationMs ?? 40_000;
  const bpm = o.bpm ?? 100;
  const beatMs = 60_000 / bpm;
  const loopMs = o.loopMs ?? beatMs * 8;
  const seed = o.seed ?? 1;
  const r = rng(seed);
  const n = msToSamples(durationMs);

  // Lead: eighth notes on a melodic line, with occasional rests, aligned to the loop's beat grid.
  const lead = new Float32Array(n);
  const leadOnsetsMs: number[] = [];
  const melody = [330, 392, 440, 494, 523, 587, 659, 587];
  if (!o.loopOnly) {
    for (let t = beatMs, i = 0; t < durationMs - 1200; t += beatMs / 2, i++) {
      if (r() < 0.15) continue;
      const bar = Math.floor(t / (beatMs * 4)) + 1;
      if (o.unisonBars && bar >= o.unisonBars[0] && bar <= o.unisonBars[1]) continue;
      const shift = o.leadOffset && bar >= o.leadOffset.fromBar && bar <= o.leadOffset.toBar ? o.leadOffset.offsetMs : 0;
      const onset = t + 20 + shift + (r() - 0.5) * 6;
      leadOnsetsMs.push(onset);
      mixAt(lead, pluck({ freq: melody[i % melody.length]!, amp: 0.4, decayS: 1.5, lengthMs: 500, seed: seed * 31 + i }), onset);
    }
  }

  // Loop.
  const { cycle, onsets } = renderCycle(loopMs, beatMs, seed, !!o.buzzInLoop);
  const acc = new Float32Array(n);
  tile(acc, cycle);
  const accOnsetsMs: number[] = [];
  for (let c = 0; c * loopMs < durationMs; c++) for (const t of onsets) if (c * loopMs + t < durationMs) accOnsetsMs.push(c * loopMs + t);
  if (o.overdub) {
    const half = Math.floor(durationMs / 2 / loopMs) * loopMs;
    const layer = renderCycle(loopMs, beatMs, seed + 50, false, 1);
    const extra = new Float32Array(n);
    tile(extra, layer.cycle, msToSamples(half));
    for (let i = 0; i < n; i++) acc[i]! += extra[i]!;
  }

  // Unison: the lead plays exactly the loop's material for those bars.
  if (o.unisonBars) {
    const from = msToSamples((o.unisonBars[0] - 1) * 4 * beatMs);
    const to = msToSamples(o.unisonBars[1] * 4 * beatMs);
    for (let i = from; i < Math.min(to, n); i++) lead[i]! += acc[i]!;
    for (const t of accOnsetsMs) if (msToSamples(t) >= from && msToSamples(t) < to) leadOnsetsMs.push(t);
    leadOnsetsMs.sort((a, b) => a - b);
  }

  const gain = o.gain ?? 1;
  const leadRms = o.loopOnly ? 0.08 : rmsOf(lead) || 0.08;
  scale(acc, (gain * leadRms) / (rmsOf(acc) || 1));
  const samples = new Float32Array(n);
  for (let i = 0; i < n; i++) samples[i] = lead[i]! + acc[i]!;

  const landmarks = landmarkStream({ durationMs, picking: strummingHand(leadOnsetsMs) });
  return { samples, leadOnsetsMs, accOnsetsMs, loopMs, beatMs, landmarks, durationMs };
}

/** Lead over an exact metronome click (3.5 kHz bursts on every beat). */
export function leadOverClick(o: { durationMs?: number; bpm?: number; gain?: number; seed?: number } = {}): Mix {
  const base = leadOverLoop({ ...o, gain: 0, seed: o.seed });
  const beatMs = base.beatMs;
  const click = new Float32Array(base.samples.length);
  const accOnsetsMs: number[] = [];
  for (let t = 20; t < base.durationMs; t += beatMs) {
    accOnsetsMs.push(t);
    const s = msToSamples(t);
    for (let i = 0; i < msToSamples(12) && s + i < click.length; i++) {
      click[s + i] = Math.sin((2 * Math.PI * 3500 * i) / SR) * Math.exp(-i / (0.003 * SR));
    }
  }
  scale(click, ((o.gain ?? 1) * rmsOf(base.samples)) / (rmsOf(click) || 1));
  const samples = Float32Array.from(base.samples, (v, i) => v + click[i]!);
  return { ...base, samples, accOnsetsMs, loopMs: beatMs };
}

/** Lead over a non-repeating backing (drums + bass with human variation). */
export function leadOverBacking(o: { durationMs?: number; bpm?: number; gain?: number; seed?: number } = {}): Mix {
  const base = leadOverLoop({ ...o, gain: 0, seed: o.seed });
  const beatMs = base.beatMs;
  const r = rng((o.seed ?? 1) + 999);
  const back = new Float32Array(base.samples.length);
  const accOnsetsMs: number[] = [];
  const bassNotes = [55, 62, 65, 73, 82];
  for (let t = 20, b = 0; t < base.durationMs; t += beatMs, b++) {
    const jitter = (r() - 0.5) * 16;
    const s = msToSamples(t + jitter);
    accOnsetsMs.push(t + jitter);
    // Kick on 1 and 3: decaying 60 Hz sine.
    if (b % 2 === 0) for (let i = 0; i < msToSamples(160) && s + i < back.length; i++) back[s + i]! += Math.sin((2 * Math.PI * 60 * i) / SR) * Math.exp(-i / (0.04 * SR)) * 0.8;
    // Hat on every beat and off-beat: short noise burst.
    for (const off of [0, beatMs / 2]) {
      const hs = msToSamples(t + jitter + off + (r() - 0.5) * 10);
      for (let i = 0; i < msToSamples(30) && hs + i < back.length; i++) back[hs + i]! += (r() * 2 - 1) * Math.exp(-i / (0.008 * SR)) * (0.2 + r() * 0.1);
    }
    // Bass: a different random note each bar.
    if (b % 4 === 0) mixAt(back, pluck({ freq: bassNotes[Math.floor(r() * bassNotes.length)]!, amp: 0.4, decayS: 1, lengthMs: beatMs * 4, seed: b + 1 }), t + jitter);
  }
  scale(back, ((o.gain ?? 1) * rmsOf(base.samples)) / (rmsOf(back) || 1));
  const samples = Float32Array.from(base.samples, (v, i) => v + back[i]!);
  return { ...base, samples, accOnsetsMs, loopMs: 0 };
}

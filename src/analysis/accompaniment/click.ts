/**
 * Click removal (tasks.md T086): drop onsets that are just the metronome. An onset within ±15 ms of
 * a click is removed unless it is a note played on the click: either the onset itself carries clear
 * guitar-range energy, or, once the click has died away (~20 ms), the sound has risen and is
 * clearly pitched. The second test matters for tight players: with the click on top, the first
 * 23 ms of a note is dominated by the click.
 */
import { AUDIO, ACCOMPANIMENT, ONSETS } from '../config/thresholds';
import { periodicity } from '../playing';
import { guitarBandShare } from './detect';

const toS = (ms: number) => Math.round((ms / 1000) * AUDIO.sampleRate);

function energy(x: Float32Array, fromMs: number, toMs: number): number {
  const a = Math.max(0, toS(fromMs));
  const b = Math.min(x.length, toS(toMs));
  let e = 0;
  for (let i = a; i < b; i++) e += x[i]! * x[i]!;
  return e / Math.max(1, b - a);
}

/** A pitched note starting under the click: louder after the click than before it, and periodic. */
function noteUnderClick(samples: Float32Array, t: number): boolean {
  const after = energy(samples, t + 20, t + 45);
  const before = energy(samples, t - 30, t - 5);
  return (
    after > before * ONSETS.pluckAttackRatio + 1e-10 &&
    periodicity(samples, t + 30, t + 130) >= ONSETS.pluckPeriodicity
  );
}

export function removeClickOnsets(
  samples: Float32Array,
  onsetsMs: number[],
  clickTimesMs: number[],
): number[] {
  return onsetsMs.filter((t) => {
    const nearClick = clickTimesMs.some((c) => Math.abs(c - t) <= ACCOMPANIMENT.clickMatchMs);
    return !nearClick || guitarBandShare(samples, t) >= 0.5 || noteUnderClick(samples, t);
  });
}

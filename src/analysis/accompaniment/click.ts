/**
 * Click removal (tasks.md T086): drop onsets that are just the metronome. An onset within ±15 ms of
 * a click is removed unless it carries clear guitar-range energy (a note played on the click).
 */
import { ACCOMPANIMENT } from '../config/thresholds';
import { guitarBandShare } from './detect';

export function removeClickOnsets(samples: Float32Array, onsetsMs: number[], clickTimesMs: number[]): number[] {
  return onsetsMs.filter((t) => {
    const nearClick = clickTimesMs.some((c) => Math.abs(c - t) <= ACCOMPANIMENT.clickMatchMs);
    return !nearClick || guitarBandShare(samples, t) >= 0.5;
  });
}

/**
 * The accompaniment's beat grid (tasks.md T084). Timing with accompaniment is measured against this.
 *
 * - loop: tempo from the accompaniment's own onsets, constrained so the loop holds a whole number
 *   of beats (its length pins the tempo down very precisely); phase from those onsets.
 * - click: the clicks are the beats.
 * - backing: the same tempo estimate and grid fit as solo playing, on the backing's onsets.
 * Bar 1 starts at the first accompaniment beat, 4/4.
 */
import { BEATS_PER_BAR, estimateBeatPeriodMs, fitBeatGrid } from '../timing/beatGrid';
import type { OnsetResult } from '../timing/onsets';

export interface AccompanimentGrid {
  periodMs: number;
  /** Time of beat k (k = 0 is beat 1 of bar 1). */
  timeAt(k: number): number;
  /** Fractional beat index of a time. */
  beatAt(t: number): number;
  beatsPerBar: number;
}

function linearGrid(phaseMs: number, periodMs: number): AccompanimentGrid {
  return {
    periodMs,
    timeAt: (k) => phaseMs + k * periodMs,
    beatAt: (t) => (t - phaseMs) / periodMs,
    beatsPerBar: BEATS_PER_BAR,
  };
}

/** Phase that best fits onsets to a fixed period (circular mean), placed at the first onset's beat. */
function fitPhase(onsetsMs: number[], periodMs: number): number {
  let sx = 0,
    sy = 0;
  for (const t of onsetsMs) {
    const a = (2 * Math.PI * (t % periodMs)) / periodMs;
    sx += Math.cos(a);
    sy += Math.sin(a);
  }
  let phase = ((Math.atan2(sy, sx) / (2 * Math.PI)) * periodMs + periodMs) % periodMs;
  const first = onsetsMs[0] ?? phase;
  // Move the phase to the beat nearest the first onset, so bar 1 starts where the music does.
  phase += Math.round((first - phase) / periodMs) * periodMs;
  return phase;
}

export function loopGrid(accOnsets: OnsetResult, loopMs: number): AccompanimentGrid | null {
  if (accOnsets.onsetsMs.length < 4) return null;
  const period = estimateBeatPeriodMs(accOnsets.envelope, accOnsets.envelopeRate);
  if (!period) return null;
  const beatsPerLoop = Math.max(1, Math.round(loopMs / period));
  const exact = loopMs / beatsPerLoop;
  return linearGrid(fitPhase(accOnsets.onsetsMs, exact), exact);
}

export function clickGrid(clickTimesMs: number[], periodMs: number): AccompanimentGrid | null {
  if (clickTimesMs.length < 4) return null;
  return linearGrid(fitPhase(clickTimesMs, periodMs), periodMs);
}

export function backingGrid(mixOnsets: OnsetResult): AccompanimentGrid | null {
  const period = estimateBeatPeriodMs(mixOnsets.envelope, mixOnsets.envelopeRate);
  if (!period) return null;
  const fit = fitBeatGrid(mixOnsets.onsetsMs, period);
  if (!fit) return null;
  const unitMs = fit.coeffs[1] * fit.subdivision; // beat length at the start
  return {
    periodMs: unitMs,
    timeAt: (k) => fit.timeAt(k * fit.subdivision),
    beatAt: (t) => {
      // Invert the fitted curve numerically around the linear estimate.
      let k = (t - fit.coeffs[0]) / fit.coeffs[1];
      for (let i = 0; i < 3; i++) {
        const err = fit.timeAt(k) - t;
        const slope = fit.coeffs[1] + 2 * fit.coeffs[2] * k;
        k -= err / (slope || 1);
      }
      return k / fit.subdivision;
    },
    beatsPerBar: BEATS_PER_BAR,
  };
}

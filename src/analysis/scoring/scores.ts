/**
 * Timing and technique scores, 0–100 (tasks.md T050, research.md R9). `null` = not enough data.
 */
import { SCORING, TEMPO } from '../config/thresholds';
import type { Finding } from '../types';

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

/** 100 × clamp(1 − (meanAbs − floor)/span, 0, 1), minus up to 15 points for drift over 3 BPM. */
export function timingScore(meanAbsOffsetMs: number | null, driftBpm: number | null): number | null {
  if (meanAbsOffsetMs === null) return null;
  const base = 100 * clamp(1 - (meanAbsOffsetMs - SCORING.timingFloorMs) / SCORING.timingSpanMs, 0, 1);
  const excessDrift = Math.max(0, Math.abs(driftBpm ?? 0) - TEMPO.driftBpm);
  const penalty =
    SCORING.maxDriftPenalty * clamp(excessDrift / (SCORING.driftPenaltyFullBpm - TEMPO.driftBpm), 0, 1);
  return Math.round(clamp(base - penalty, 0, 100));
}

/**
 * 100 − Σ(severity weight of technique findings) per minute, floored at 0. Only aspects that were
 * actually assessed count: null when neither hand was seen enough and clarity wasn't assessed.
 */
export function techniqueScore(
  findings: Finding[],
  durationMs: number,
  coverage: { frettingHand: number; pickingHand: number },
  clarityAssessed: boolean,
): number | null {
  const handsAssessed =
    coverage.frettingHand >= SCORING.minCoverageForScore || coverage.pickingHand >= SCORING.minCoverageForScore;
  if (!handsAssessed && !clarityAssessed) return null;
  const minutes = Math.max(1, durationMs / 60_000);
  const weight = findings
    .filter((f) => f.category === 'technique')
    .reduce((sum, f) => sum + SCORING.severityWeight[f.severity], 0);
  return Math.round(clamp(100 - weight / minutes, 0, 100));
}

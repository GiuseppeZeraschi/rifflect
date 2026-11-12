/**
 * Timing findings (tasks.md T044, contract § Issue codes). Thresholds come from config/thresholds.
 * Against a solo player's own grid, the overall mean offset is zero by construction, so rushing /
 * dragging are reported per beat position ("you rush beat 4"), never overall.
 */
import { TEMPO } from '../config/thresholds';
import type { Finding, Severity } from '../types';
import type { BeatGrid } from './beatGrid';
import type { TimingMetrics } from './metrics';

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
const round5 = (x: number) => Math.round(x / 5) * 5;

function severityForMs(absMs: number): Severity {
  return absMs >= 60 ? 'major' : absMs >= 40 ? 'moderate' : 'minor';
}

export function timingFindings(grid: BeatGrid, m: TimingMetrics, targetTempoBpm?: number): Finding[] {
  const out: Finding[] = [];
  const n = m.inliers.length;
  const sizeConfidence = clamp(0.5 + n / 40, 0.5, 0.95);

  // Rushing / dragging per beat position.
  for (const p of m.perBeat) {
    if (p.count < TEMPO.minOnsetsPerBeatPosition) continue;
    if (Math.abs(p.meanMs) <= TEMPO.rushDragMs) continue;
    const confidence = clamp(0.5 + 0.08 * p.tStat, 0, 0.95) * clamp(0.6 + p.count / 20, 0, 1);
    out.push({
      category: 'timing',
      aspect: 'rhythm',
      issueCode: p.meanMs < 0 ? 'timing.rushing' : 'timing.dragging',
      severity: severityForMs(Math.abs(p.meanMs)),
      confidence,
      startMs: Math.max(0, Math.round(p.firstMs)),
      endMs: Math.round(p.lastMs),
      metrics: {
        beat: p.beat,
        meanOffsetMs: round5(p.meanMs),
        count: p.count,
        barFrom: p.firstBar,
        barTo: p.lastBar,
        bpm: Math.round(grid.bpm),
      },
    });
  }

  // Uneven subdivision: random spread left after removing systematic per-beat bias.
  if (m.unevenStdMs > TEMPO.unevenStdMs && n >= 8) {
    out.push({
      category: 'timing',
      aspect: 'rhythm',
      issueCode: 'timing.uneven_subdivision',
      severity: m.unevenStdMs >= 55 ? 'moderate' : 'minor',
      confidence: sizeConfidence * clamp(0.6 + (m.unevenStdMs - TEMPO.unevenStdMs) / 50, 0, 1),
      startMs: Math.max(0, Math.round(m.firstMs)),
      endMs: Math.round(m.lastMs),
      metrics: { spreadMs: round5(m.unevenStdMs), subdivision: grid.subdivision, bpm: Math.round(grid.bpm) },
    });
  }

  // Tempo drift.
  if (Math.abs(m.driftBpm) > TEMPO.driftBpm && n >= 12) {
    out.push({
      category: 'timing',
      aspect: 'tempo',
      issueCode: m.driftBpm > 0 ? 'timing.tempo_drift_up' : 'timing.tempo_drift_down',
      severity: Math.abs(m.driftBpm) >= 10 ? 'moderate' : 'minor',
      confidence: sizeConfidence * clamp(0.6 + Math.abs(m.driftBpm) / 20, 0, 1),
      startMs: Math.max(0, Math.round(m.firstMs)),
      endMs: Math.round(m.lastMs),
      metrics: {
        startBpm: Math.round(grid.bpmStart),
        endBpm: Math.round(grid.bpmEnd),
        driftBpm: Math.round(Math.abs(m.driftBpm)),
      },
    });
  }

  // Off target tempo.
  if (targetTempoBpm) {
    const delta = grid.bpm - targetTempoBpm;
    if (Math.abs(delta) / targetTempoBpm > TEMPO.offTargetFraction) {
      out.push({
        category: 'timing',
        aspect: 'tempo',
        issueCode: 'timing.off_target_tempo',
        severity: Math.abs(delta) / targetTempoBpm > 0.15 ? 'moderate' : 'minor',
        confidence: sizeConfidence,
        startMs: Math.max(0, Math.round(m.firstMs)),
        endMs: Math.round(m.lastMs),
        metrics: {
          playedBpm: Math.round(grid.bpm),
          targetBpm: targetTempoBpm,
          deltaBpm: Math.round(delta),
          direction: delta > 0 ? 'faster' : 'slower',
        },
      });
    }
  }

  // Steady: positive feedback when nothing above applies and timing is tight.
  const hasRhythmIssue = out.some((f) => f.aspect === 'rhythm' || f.issueCode.startsWith('timing.tempo_drift'));
  if (!hasRhythmIssue && m.meanAbsOffsetMs <= TEMPO.steadyMeanAbsMs && n >= 8) {
    out.push({
      category: 'timing',
      aspect: 'rhythm',
      issueCode: 'timing.steady',
      severity: 'info',
      confidence: sizeConfidence,
      startMs: Math.max(0, Math.round(m.firstMs)),
      endMs: Math.round(m.lastMs),
      metrics: { meanAbsOffsetMs: round5(m.meanAbsOffsetMs), bpm: Math.round(grid.bpm) },
    });
  }
  return out;
}

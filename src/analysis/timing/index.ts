/** Timing analysis for a solo take: onsets → beat grid → metrics → findings. */
import { defaultDsp, type Dsp } from '../dsp';
import type { Finding } from '../types';
import { estimateBeatPeriodMs, fitBeatGrid, type BeatGrid } from './beatGrid';
import { timingFindings } from './findings';
import { timingMetrics } from './metrics';
import { detectOnsets, type OnsetResult } from './onsets';

export interface TimingAnalysis {
  onsets: OnsetResult;
  grid: BeatGrid | null;
  tempo: { bpm: number | null; driftBpm: number | null; meanAbsOffsetMs: number | null; targetDeltaBpm: number | null };
  findings: Finding[];
}

export function analyseTimingFromOnsets(onsets: OnsetResult, opts: { targetTempoBpm?: number }, dsp: Dsp = defaultDsp): TimingAnalysis {
  const empty: TimingAnalysis = {
    onsets,
    grid: null,
    tempo: { bpm: null, driftBpm: null, meanAbsOffsetMs: null, targetDeltaBpm: null },
    findings: [],
  };
  const period = estimateBeatPeriodMs(onsets.envelope, onsets.envelopeRate, opts.targetTempoBpm, dsp);
  if (period === null) return empty;
  const grid = fitBeatGrid(onsets.onsetsMs, period);
  if (!grid) return empty;
  const m = timingMetrics(grid);
  return {
    onsets,
    grid,
    tempo: {
      bpm: grid.bpm,
      driftBpm: m.driftBpm,
      meanAbsOffsetMs: m.meanAbsOffsetMs,
      targetDeltaBpm: opts.targetTempoBpm ? grid.bpm - opts.targetTempoBpm : null,
    },
    findings: timingFindings(grid, m, opts.targetTempoBpm),
  };
}

export function analyseTiming(samples: Float32Array, opts: { targetTempoBpm?: number }, dsp: Dsp = defaultDsp): TimingAnalysis {
  return analyseTimingFromOnsets(detectOnsets(samples, dsp), opts, dsp);
}

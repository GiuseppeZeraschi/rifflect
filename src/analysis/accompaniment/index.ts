/**
 * The accompaniment stage (tasks.md T089, research.md R16): given a detected loop, click or
 * backing, find the live playing and measure its timing against the accompaniment.
 *
 * - loop: REPET separation → live residual audio; live onsets from the residual.
 * - click: no separation needed; onsets that are just the click are removed.
 * - backing: no exact repetition to subtract, so no audio separation (research.md R16 note):
 *   live notes are identified by picking-hand strokes, and separation is at best "partial".
 */
import { limitation } from '../limitations';
import { hasPlaying } from '../playing';
import type { HandTracks } from '../technique/hands';
import { detectOnsets, type OnsetResult } from '../timing/onsets';
import type { ClarityContext } from '../technique/clarity';
import type { AccompanimentKind, AnalysisResult, Finding, Limitation } from '../types';
import { defaultDsp, type Dsp } from '../dsp';
import { attributeOnsets } from './attribution';
import { removeClickOnsets } from './click';
import type { Detection } from './detect';
import { accompanimentTiming } from './findings';
import { backingGrid, clickGrid, loopGrid, type AccompanimentGrid } from './grid';
import { separateLoop } from './repet';
import { findUnison } from './unison';

export interface AccompaniedAnalysis {
  status: 'analysed' | 'no_playing';
  /** Live audio (the residual for loops; the mix otherwise). */
  liveSignal: Float32Array;
  liveOnsetsMs: number[];
  liveConfidence: number[];
  grid: AccompanimentGrid | null;
  timingFindings: Finding[];
  tempo: AnalysisResult['tempo'];
  accompaniment: AnalysisResult['accompaniment'];
  limitations: Limitation[];
  /** Clarity findings can't be trusted (poor separation). */
  suppressClarity: boolean;
  clarityContext: ClarityContext;
}

export function analyseAccompanied({
  samples,
  mixOnsets,
  detection,
  kind,
  tracks,
  targetTempoBpm,
  dsp = defaultDsp,
}: {
  samples: Float32Array;
  mixOnsets: OnsetResult;
  detection: Detection;
  kind: Exclude<AccompanimentKind, 'none'>;
  tracks: HandTracks | null;
  targetTempoBpm?: number;
  dsp?: Dsp;
}): AccompaniedAnalysis {
  const limitations: Limitation[] = [];
  let liveSignal = samples;
  let liveShare = 1;
  let grid: AccompanimentGrid | null = null;
  let residualOnsets: number[];
  let unison: { ranges: [number, number][]; unisonOnsets: Set<number> } = { ranges: [], unisonOnsets: new Set() };
  let repeatingSignal: Float32Array | null = null;
  let accOnsetsMs: number[] = [];

  if (kind === 'loop' && detection.loopLengthMs) {
    const sep = separateLoop(samples, mixOnsets.spec, detection.loopLengthMs);
    liveSignal = sep.residual;
    liveShare = sep.liveShare;
    for (const [a, b] of sep.changedRanges) limitations.push(limitation('accompaniment_changed', a, b));
    const repeating = Float32Array.from(samples, (v, i) => v - sep.residual[i]!);
    repeatingSignal = repeating;
    const accOnsets = detectOnsets(repeating, dsp);
    accOnsetsMs = accOnsets.onsetsMs;
    grid = loopGrid(accOnsets, detection.loopLengthMs);
    residualOnsets = detectOnsets(liveSignal, dsp).onsetsMs;
  } else if (kind === 'click' && detection.clickPeriodMs) {
    grid = clickGrid(detection.clickTimesMs, detection.clickPeriodMs);
    residualOnsets = removeClickOnsets(samples, mixOnsets.onsetsMs, detection.clickTimesMs);
  } else {
    // Backing (or "on" with nothing detected): no audio separation is possible.
    if (kind === 'loop') limitations.push(limitation('too_few_loop_cycles'));
    grid = backingGrid(mixOnsets);
    residualOnsets = mixOnsets.onsetsMs;
    // Without exact repetition nothing is subtracted; only the hands can tell the live notes apart.
    liveShare = tracks ? 1 : 0;
  }

  const att = attributeOnsets({ residualOnsetsMs: residualOnsets, residual: liveSignal, mix: samples, liveShare, tracks });
  // Backing tracks can't be better than "partial": nothing was actually subtracted.
  const separation = kind === 'backing' && att.separation === 'good' ? 'partial' : kind === 'click' ? 'good' : att.separation;

  const finalKind: Exclude<AccompanimentKind, 'none'> = kind === 'loop' && !detection.loopLengthMs ? 'backing' : kind;
  const accompaniment: AnalysisResult['accompaniment'] = {
    kind: finalKind,
    loopLengthMs: finalKind === 'loop' ? Math.round(detection.loopLengthMs!) : null,
    timingReference: 'accompaniment',
    separationConfidence: separation,
    liveOnsetMatchRate: att.matchRate,
  };

  const emptyTempo = { bpm: null, driftBpm: null, meanAbsOffsetMs: null, targetDeltaBpm: null };
  // Loop or backing alone, no live playing → no_playing (contract guarantee 1).
  const live = att.onsetsMs;
  if (live.length < 4 || !hasPlaying(liveSignal, live)) {
    // Say why, if the player may have been playing but couldn't be heard over the backing: their
    // picking hand was moving, or there's no hand tracking to tell.
    const mayHavePlayed = !tracks || att.strokeCount >= 4;
    if (mayHavePlayed && att.tooLoud) limitations.push(limitation('accompaniment_too_loud'));
    if (mayHavePlayed && separation === 'poor') limitations.push(limitation('accompaniment_separation_low'));
    return { status: 'no_playing', liveSignal, liveOnsetsMs: [], liveConfidence: [], grid, timingFindings: [], tempo: emptyTempo, accompaniment, limitations, suppressClarity: true, clarityContext: { kind: 'backing' } };
  }

  if (att.tooLoud) limitations.push(limitation('accompaniment_too_loud'));
  if (repeatingSignal) unison = findUnison(live, accOnsetsMs, liveSignal, repeatingSignal);
  for (const [a, b] of unison.ranges) limitations.push(limitation('unison_with_accompaniment', a, b));
  const suppressClarity = separation === 'poor';
  if (suppressClarity) limitations.push(limitation('accompaniment_separation_low'));

  // Notes in unison with the loop can't be told apart from it, so they don't count for timing.
  const timedOnsets = live.filter((t) => !unison.unisonOnsets.has(t));
  const timing = grid ? accompanimentTiming(timedOnsets, grid) : { findings: [], meanAbsOffsetMs: null, subdivision: 1 as const };
  if (!grid) limitations.push(limitation('tempo_not_detected'));
  const bpm = grid ? 60000 / grid.periodMs : null;
  return {
    status: 'analysed',
    liveSignal,
    liveOnsetsMs: live,
    liveConfidence: att.confidence,
    grid,
    timingFindings: timing.findings,
    tempo: {
      bpm,
      driftBpm: null,
      meanAbsOffsetMs: timing.meanAbsOffsetMs,
      targetDeltaBpm: bpm !== null && targetTempoBpm ? bpm - targetTempoBpm : null,
    },
    accompaniment,
    limitations,
    suppressClarity,
    clarityContext:
      finalKind === 'loop' ? { kind: 'loop', loopMs: detection.loopLengthMs! } : finalKind === 'click' ? { kind: 'click' } : { kind: 'backing' },
  };
}

/**
 * Analysis engine entry point (tasks.md T052, contracts/analysis-engine.md).
 *
 * Pure TypeScript, deterministic, no I/O. Runs as an async pipeline that yields to the event loop
 * between stages (research.md R5), reporting progress and honouring cancellation.
 */
import { AUDIO, CONFIDENCE_FLOOR, ENGINE_VERSION } from './config/thresholds';
import { defaultDsp, type Dsp } from './dsp';
import { buildSummary, renderFinding } from './feedback-text/render';
import { limitation } from './limitations';
import { hasPlaying } from './playing';
import { techniqueScore, timingScore } from './scoring/scores';
import { analyseTechnique } from './technique';
import { analyseTimingFromOnsets } from './timing';
import { detectOnsets } from './timing/onsets';
import type { AnalysisInput, AnalysisOptions, AnalysisResult, Finding, Limitation, Severity } from './types';

export * from './types';
export { ENGINE_VERSION } from './config/thresholds';

const SEVERITY_ORDER: Record<Severity, number> = { major: 0, moderate: 1, minor: 2, info: 3 };

class AbortError extends Error {
  constructor() {
    super('Analysis cancelled');
    this.name = 'AbortError';
  }
}

async function step(opts: AnalysisOptions | undefined, progress: number): Promise<void> {
  if (opts?.signal?.aborted) throw new AbortError();
  opts?.onProgress?.(progress);
  await new Promise((r) => setTimeout(r, 0)); // let the UI breathe between heavy stages
  if (opts?.signal?.aborted) throw new AbortError();
}

/** Rough SNR (dB): loud frames vs quiet frames of a 50 ms RMS envelope. */
function estimateSnrDb(samples: Float32Array): number {
  const block = Math.round(0.05 * AUDIO.sampleRate);
  const rms: number[] = [];
  for (let i = 0; i + block <= samples.length; i += block) {
    let e = 0;
    for (let j = i; j < i + block; j++) e += samples[j]! * samples[j]!;
    rms.push(Math.sqrt(e / block));
  }
  if (rms.length < 10) return Infinity;
  rms.sort((a, b) => a - b);
  const quiet = rms[Math.floor(rms.length * 0.1)]!;
  const loud = rms[Math.floor(rms.length * 0.9)]!;
  return quiet > 0 ? 20 * Math.log10(loud / quiet) : Infinity;
}

function peakOf(samples: Float32Array): number {
  let p = 0;
  for (let i = 0; i < samples.length; i++) p = Math.max(p, Math.abs(samples[i]!));
  return p;
}

function emptyResult(input: AnalysisInput, limitations: Limitation[]): AnalysisResult {
  return {
    engineVersion: ENGINE_VERSION,
    status: 'no_playing',
    timingScore: null,
    techniqueScore: null,
    summary: "We couldn't find any guitar playing to analyse in this take.",
    tempo: { bpm: null, driftBpm: null, meanAbsOffsetMs: null, targetDeltaBpm: null },
    accompaniment: { kind: 'none', loopLengthMs: null, timingReference: 'own_playing', separationConfidence: null, liveOnsetMatchRate: null },
    coverage: { audio: 0, frettingHand: 0, pickingHand: 0, posture: 0 },
    limitations: input.interrupted ? [limitation('take_interrupted'), ...limitations] : limitations,
    points: [],
  };
}

export async function analyseTake(input: AnalysisInput, opts?: AnalysisOptions, dsp: Dsp = defaultDsp): Promise<AnalysisResult> {
  const { samples } = input.audio;
  await step(opts, 0);

  // 1. Onsets.
  const onsets = detectOnsets(samples, dsp);
  await step(opts, 0.3);

  // 2. No playing → no findings, ever (guarantee 1).
  if (!hasPlaying(samples, onsets.onsetsMs)) {
    opts?.onProgress?.(1);
    return emptyResult(input, []);
  }

  // 3. Accompaniment stage (US4, research.md R16). Until it exists every take is analysed as solo:
  //    kind 'none', timing against the player's own beat. When input.accompaniment === 'off' this
  //    stage must always be skipped (guarantee 8).
  const accompaniment: AnalysisResult['accompaniment'] = {
    kind: 'none',
    loopLengthMs: null,
    timingReference: 'own_playing',
    separationConfidence: null,
    liveOnsetMatchRate: null,
  };

  // 4. Timing.
  const timing = analyseTimingFromOnsets(onsets, { targetTempoBpm: input.targetTempoBpm }, dsp);
  await step(opts, 0.55);

  // 5. Technique (hands + clarity).
  const technique = analyseTechnique({
    samples,
    onsetsMs: onsets.onsetsMs,
    landmarks: input.landmarks,
    handedness: input.player.handedness,
    landmarksMirrored: input.landmarksMirrored ?? false,
    durationMs: input.durationMs,
  });
  await step(opts, 0.85);

  // 6. Limitations.
  const limitations: Limitation[] = [];
  if (input.interrupted) limitations.push(limitation('take_interrupted'));
  if (!timing.grid) limitations.push(limitation('tempo_not_detected'));
  if (peakOf(samples) >= AUDIO.clippingPeak) limitations.push(limitation('clipping_audio'));
  if (estimateSnrDb(samples) < AUDIO.noisySnrDb) limitations.push(limitation('noisy_audio'));
  limitations.push(...technique.limitations);

  // 7. Findings above the confidence floor (guarantee 6), clamped to the take (guarantee 3).
  const clampMs = (t: number) => Math.min(Math.max(0, Math.round(t)), input.durationMs);
  let findings: Finding[] = [...timing.findings, ...technique.findings]
    .filter((f) => f.confidence >= CONFIDENCE_FLOOR)
    .map((f) => ({ ...f, startMs: clampMs(f.startMs), ...(f.endMs !== undefined ? { endMs: clampMs(f.endMs) } : {}) }));

  // 8. Every category gets a point, or a limitation and a null score (guarantee 2).
  if (timing.grid && !findings.some((f) => f.category === 'timing')) {
    findings.push({
      category: 'timing',
      aspect: 'rhythm',
      issueCode: 'timing.steady',
      severity: 'info',
      confidence: CONFIDENCE_FLOOR,
      startMs: clampMs(timing.grid.assignments[0]?.onsetMs ?? 0),
      metrics: { meanAbsOffsetMs: Math.round((timing.tempo.meanAbsOffsetMs ?? 0) / 5) * 5, bpm: Math.round(timing.grid.bpm) },
    });
  }

  // 9. Scores.
  const clarityAssessed = findings.some((f) => f.aspect === 'clarity');
  const tScore = timing.grid ? timingScore(timing.tempo.meanAbsOffsetMs, timing.tempo.driftBpm) : null;
  const kScore = techniqueScore(findings, input.durationMs, technique.coverage, clarityAssessed);
  if (kScore === null && !findings.some((f) => f.category === 'technique')) {
    findings = findings.filter((f) => f.category !== 'technique');
  }

  // 10. Text, ordering and summary.
  const points = findings
    .sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || a.startMs - b.startMs || a.issueCode.localeCompare(b.issueCode))
    .map((f) => renderFinding(f, input.player.skillLevel));

  opts?.onProgress?.(1);
  return {
    engineVersion: ENGINE_VERSION,
    status: 'analysed',
    timingScore: tScore,
    techniqueScore: kScore,
    summary: buildSummary(points, input.player.skillLevel),
    tempo: timing.tempo,
    accompaniment,
    coverage: { audio: 1, ...technique.coverage },
    limitations,
    points,
  };
}

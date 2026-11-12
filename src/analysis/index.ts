/**
 * Analysis engine entry point (tasks.md T052, contracts/analysis-engine.md).
 *
 * Pure TypeScript, deterministic, no I/O. Runs as an async pipeline that yields to the event loop
 * between stages (research.md R5), reporting progress and honouring cancellation.
 */
import { analyseAccompanied } from './accompaniment';
import { detectAccompaniment, type Detection } from './accompaniment/detect';
import { AUDIO, CONFIDENCE_FLOOR, ENGINE_VERSION, TECHNIQUE } from './config/thresholds';
import { defaultDsp, type Dsp } from './dsp';
import { buildSummary, renderFinding } from './feedback-text/render';
import { limitation } from './limitations';
import { hasPlaying } from './playing';
import { techniqueScore, timingScore } from './scoring/scores';
import { analyseTechnique } from './technique';
import type { ClarityContext } from './technique/clarity';
import { assignHands } from './technique/hands';
import { analyseTimingFromOnsets } from './timing';
import { detectOnsets } from './timing/onsets';
import type { AccompanimentKind, AnalysisInput, AnalysisOptions, AnalysisResult, Finding, Limitation, Severity } from './types';

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

  // 2. Accompaniment detection (US4, research.md R16). 'off' skips it entirely, so the result is
  //    identical to solo analysis (guarantee 8). 'on' with nothing detected is treated as backing.
  let detection: Detection | null = null;
  let kind: AccompanimentKind = 'none';
  if (input.accompaniment !== 'off') {
    detection = detectAccompaniment(samples);
    kind = detection.kind;
    if (kind === 'none' && input.accompaniment === 'on') kind = 'backing';
  }
  await step(opts, 0.4);

  // 3. Timing: against the player's own beat (solo) or the accompaniment's.
  let timingFindings: Finding[];
  let tempo: AnalysisResult['tempo'];
  let timingGridOk: boolean;
  let fallbackStartMs = 0;
  let fallbackBpm = 0;
  let accompaniment: AnalysisResult['accompaniment'] = {
    kind: 'none',
    loopLengthMs: null,
    timingReference: 'own_playing',
    separationConfidence: null,
    liveOnsetMatchRate: null,
  };
  const extraLimitations: Limitation[] = [];
  let clarity: { onsetsMs?: number[]; liveConfidence?: number[]; context?: ClarityContext } = {};
  let suppressClarity = false;

  if (kind === 'none') {
    // No playing → no findings, ever (guarantee 1).
    if (!hasPlaying(samples, onsets.onsetsMs)) {
      opts?.onProgress?.(1);
      return emptyResult(input, []);
    }
    const timing = analyseTimingFromOnsets(onsets, { targetTempoBpm: input.targetTempoBpm }, dsp);
    timingFindings = timing.findings;
    tempo = timing.tempo;
    timingGridOk = !!timing.grid;
    fallbackStartMs = timing.grid?.assignments[0]?.onsetMs ?? 0;
    fallbackBpm = timing.grid?.bpm ?? 0;
    if (!timing.grid) extraLimitations.push(limitation('tempo_not_detected'));
  } else {
    const tracks = input.landmarks?.length
      ? assignHands(input.landmarks, { handedness: input.player.handedness, mirrored: input.landmarksMirrored ?? false })
      : null;
    const acc = analyseAccompanied({ samples, mixOnsets: onsets, detection: detection!, kind, tracks, targetTempoBpm: input.targetTempoBpm, dsp });
    if (acc.status === 'no_playing') {
      opts?.onProgress?.(1);
      return { ...emptyResult(input, acc.limitations), accompaniment: acc.accompaniment };
    }
    timingFindings = acc.timingFindings;
    tempo = acc.tempo;
    timingGridOk = !!acc.grid;
    fallbackStartMs = acc.liveOnsetsMs[0] ?? 0;
    fallbackBpm = acc.tempo.bpm ?? 0;
    accompaniment = acc.accompaniment;
    extraLimitations.push(...acc.limitations);
    // Clarity is judged on the mix at the live onsets, relative to the accompaniment (see clarity.ts).
    clarity = { onsetsMs: acc.liveOnsetsMs, liveConfidence: acc.liveConfidence, context: acc.clarityContext };
    suppressClarity = acc.suppressClarity;
  }
  await step(opts, 0.6);

  // 4. Technique (hands + clarity). Fretting-hand analysis depends only on the landmarks
  //    (guarantee 11). The strumming-pause check asks whether the player's own notes carried on, so
  //    with accompaniment it uses the live onsets (the loop always carries on).
  const technique = analyseTechnique({
    samples,
    onsetsMs: onsets.onsetsMs,
    landmarks: input.landmarks,
    handedness: input.player.handedness,
    landmarksMirrored: input.landmarksMirrored ?? false,
    durationMs: input.durationMs,
    clarityOnsetsMs: clarity.onsetsMs,
    // Only notes we're sure are the player's (stroke-matched): faint loop leakage in the lead's rests
    // must not count as "the music carried on".
    pickingOnsetsMs: clarity.onsetsMs?.filter((_, i) => (clarity.liveConfidence?.[i] ?? 1) >= TECHNIQUE.liveClarityConfidence),
    liveConfidence: clarity.liveConfidence,
    clarityContext: clarity.context,
  });
  await step(opts, 0.85);

  // 5. Limitations.
  const limitations: Limitation[] = [];
  if (input.interrupted) limitations.push(limitation('take_interrupted'));
  limitations.push(...extraLimitations);
  if (peakOf(samples) >= AUDIO.clippingPeak) limitations.push(limitation('clipping_audio'));
  if (kind === 'none' && estimateSnrDb(samples) < AUDIO.noisySnrDb) limitations.push(limitation('noisy_audio'));
  limitations.push(...technique.limitations);

  // 6. Findings above the confidence floor (guarantee 6), clamped to the take (guarantee 3).
  //    With poor separation, clarity can't be attributed to the player (guarantee 10).
  const clampMs = (t: number) => Math.min(Math.max(0, Math.round(t)), input.durationMs);
  let findings: Finding[] = [...timingFindings, ...technique.findings]
    .filter((f) => f.confidence >= CONFIDENCE_FLOOR)
    .filter((f) => !(suppressClarity && f.aspect === 'clarity'))
    .map((f) => ({ ...f, startMs: clampMs(f.startMs), ...(f.endMs !== undefined ? { endMs: clampMs(f.endMs) } : {}) }));

  // 7. Every category gets a point, or a limitation and a null score (guarantee 2).
  if (timingGridOk && !findings.some((f) => f.category === 'timing')) {
    findings.push({
      category: 'timing',
      aspect: 'rhythm',
      issueCode: kind === 'none' ? 'timing.steady' : 'timing.locked_to_accompaniment',
      severity: 'info',
      confidence: CONFIDENCE_FLOOR,
      startMs: clampMs(fallbackStartMs),
      metrics: { meanAbsOffsetMs: Math.round((tempo.meanAbsOffsetMs ?? 0) / 5) * 5, bpm: Math.round(fallbackBpm) },
    });
  }

  // 8. Scores.
  const clarityAssessed = findings.some((f) => f.aspect === 'clarity');
  const tScore = timingGridOk ? timingScore(tempo.meanAbsOffsetMs, tempo.driftBpm) : null;
  const kScore = techniqueScore(findings, input.durationMs, technique.coverage, clarityAssessed);
  if (kScore === null && !findings.some((f) => f.category === 'technique')) {
    findings = findings.filter((f) => f.category !== 'technique');
  }

  // 9. Text, ordering and summary.
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
    tempo,
    accompaniment,
    coverage: { audio: 1, ...technique.coverage },
    limitations,
    points,
  };
}

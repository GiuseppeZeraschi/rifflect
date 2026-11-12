/**
 * Technique analysis for a take: hand roles → fretting / picking analysers, plus audio clarity
 * and hand-related limitations (tasks.md T045–T049).
 *
 * Posture (T049): v1 only looks at the hands. Wrist angle is reported under the fretting hand
 * (`technique.wrist_strain`); whole-body posture is not assessed, so posture coverage is 0 and a
 * `posture_not_assessed` limitation is always present (research.md R3, R7).
 */
import { FRAMING } from '../config/thresholds';
import { limitation } from '../limitations';
import type { Finding, Handedness, LandmarkFrame, Limitation } from '../types';
import { analyseClarity } from './clarity';
import { analyseFretting } from './frettingHand';
import { assignHands, rangesWhere, type HandTracks } from './hands';
import { analysePicking } from './pickingHand';

export interface TechniqueInput {
  samples: Float32Array;
  onsetsMs: number[];
  landmarks: LandmarkFrame[] | null;
  handedness: Handedness;
  landmarksMirrored: boolean;
  durationMs: number;
  /** Per-onset live confidence (US4); omitted for solo takes. */
  liveConfidence?: number[];
  /** Signal used for clarity (the separated live signal with accompaniment). Defaults to `samples`. */
  claritySignal?: Float32Array;
}

export interface TechniqueAnalysis {
  findings: Finding[];
  coverage: { frettingHand: number; pickingHand: number; posture: number };
  limitations: Limitation[];
  tracks: HandTracks | null;
}

export function analyseTechnique(input: TechniqueInput): TechniqueAnalysis {
  const clarity = analyseClarity(input.claritySignal ?? input.samples, input.onsetsMs, {
    liveConfidence: input.liveConfidence,
  });
  const limitations: Limitation[] = [limitation('posture_not_assessed')];

  if (!input.landmarks || input.landmarks.length === 0) {
    limitations.unshift(limitation('landmarks_missing'));
    return { findings: clarity, coverage: { frettingHand: 0, pickingHand: 0, posture: 0 }, limitations, tracks: null };
  }

  const tracks = assignHands(input.landmarks, { handedness: input.handedness, mirrored: input.landmarksMirrored });
  for (const [a, b] of tracks.missingBoth) limitations.unshift(limitation('hands_not_visible', a, b));
  for (const [a, b] of tracks.frettingOutOfFrame) limitations.unshift(limitation('fretting_hand_out_of_frame', a, b));
  const dark = rangesWhere(tracks.tMs, tracks.frameMs, (i) => (tracks.brightness[i] ?? 1) < FRAMING.lowLightBrightness);
  for (const [a, b] of dark) limitations.unshift(limitation('low_light', a, b));

  return {
    findings: [...analyseFretting(tracks), ...analysePicking(tracks, input.onsetsMs), ...clarity],
    coverage: { frettingHand: tracks.coverage.fretting, pickingHand: tracks.coverage.picking, posture: 0 },
    limitations,
    tracks,
  };
}

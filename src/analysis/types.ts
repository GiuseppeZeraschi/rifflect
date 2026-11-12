/**
 * Public types of the analysis engine — exactly as specs/001-guitar-practice-feedback/contracts/analysis-engine.md.
 * The engine is pure TypeScript: no React Native, Expo or native-module imports (ESLint-enforced).
 */

export type Handedness = 'right' | 'left';
export type SkillLevel = 'beginner' | 'intermediate' | 'advanced';
export type CameraPosition = 'front' | 'back';
export type AccompanimentSetting = 'auto' | 'on' | 'off';
export type AccompanimentKind = 'none' | 'loop' | 'backing' | 'click';
export type TimingReference = 'own_playing' | 'accompaniment';
export type SeparationConfidence = 'good' | 'partial' | 'poor';
export type Category = 'timing' | 'technique';
export type Aspect = 'tempo' | 'rhythm' | 'fretting_hand' | 'picking_hand' | 'clarity' | 'posture';
export type Severity = 'info' | 'minor' | 'moderate' | 'major';

/** A 3D landmark point, normalised to the upright, un-mirrored image (x, y in 0..1). */
export type Point3 = [number, number, number];

export interface HandObservation {
  /** MediaPipe's raw handedness label (mirror correction happens in the engine). */
  side: 'Left' | 'Right';
  score: number;
  /** 21 MediaPipe hand landmarks. */
  pts: Point3[];
}

export interface LandmarkFrame {
  /** Frame time on the recording clock, in ms (same clock as the audio). */
  tMs: number;
  hands: HandObservation[];
  /** 0..1 mean luma, when known (used for the low-light limitation). */
  brightness?: number;
}

export interface AnalysisInput {
  /** Mono audio of the whole take at 22,050 Hz. */
  audio: { sampleRate: 22050; samples: Float32Array };
  /** null → technique is limited to audio. */
  landmarks: LandmarkFrame[] | null;
  /** 5_000..300_000 */
  durationMs: number;
  player: { handedness: Handedness; skillLevel: SkillLevel };
  cameraPosition: CameraPosition;
  /** 30..300, optional goal: a hint for tempo estimation and for comparison only. */
  targetTempoBpm?: number;
  /** FR-024 */
  accompaniment: AccompanimentSetting;
  /**
   * True if landmark frames were left mirrored (selfie view). Default false: frames are un-mirrored,
   * so MediaPipe's handedness labels are flipped (it assumes selfie input). Set from frame.isMirrored.
   */
  landmarksMirrored?: boolean;
  /** True when the recording ended abnormally (adds a take_interrupted limitation). */
  interrupted?: boolean;
}

export interface AnalysisOptions {
  /** Progress 0..1, reported at each stage. */
  onProgress?: (fraction: number) => void;
  signal?: AbortSignal;
}

export const ISSUE_CODES = [
  'timing.steady',
  'timing.rushing',
  'timing.dragging',
  'timing.uneven_subdivision',
  'timing.tempo_drift_up',
  'timing.tempo_drift_down',
  'timing.off_target_tempo',
  'timing.locked_to_accompaniment',
  'timing.ahead_of_accompaniment',
  'timing.behind_accompaniment',
  'timing.lost_place_in_loop',
  'technique.clean',
  'technique.fret_buzz',
  'technique.muted_notes',
  'technique.unwanted_open_strings',
  'technique.fret_thumb_over_neck',
  'technique.flat_fingers',
  'technique.fingers_lifting_high',
  'technique.wrist_strain',
  'technique.inconsistent_strum',
  'technique.stopped_strum_motion',
] as const;
export type IssueCode = (typeof ISSUE_CODES)[number];

export const LIMITATION_CODES = [
  'hands_not_visible',
  'fretting_hand_out_of_frame',
  'low_light',
  'noisy_audio',
  'clipping_audio',
  'landmarks_missing',
  'posture_not_assessed',
  'tempo_not_detected',
  'take_interrupted',
  'accompaniment_separation_low',
  'accompaniment_too_loud',
  'accompaniment_changed',
  'unison_with_accompaniment',
  'too_few_loop_cycles',
] as const;
export type LimitationCode = (typeof LIMITATION_CODES)[number];

export interface Limitation {
  code: LimitationCode;
  message: string;
  fromMs?: number;
  toMs?: number;
}

export interface FeedbackPointOut {
  category: Category;
  aspect: Aspect;
  issueCode: IssueCode;
  severity: Severity;
  /** ≥ CONFIDENCE_FLOOR (0.6) */
  confidence: number;
  startMs: number;
  endMs?: number;
  /** What was seen/heard and where (FR-009). */
  observation: string;
  /** A concrete improvement (FR-009). */
  suggestion: string;
  metrics: Record<string, number | string>;
}

export interface AnalysisResult {
  engineVersion: string;
  status: 'analysed' | 'no_playing';
  /** 0..100 */
  timingScore: number | null;
  /** 0..100 */
  techniqueScore: number | null;
  /** ≤ 140 chars, skill-level tone */
  summary: string;
  tempo: {
    bpm: number | null;
    driftBpm: number | null;
    meanAbsOffsetMs: number | null;
    targetDeltaBpm: number | null;
  };
  accompaniment: {
    kind: AccompanimentKind;
    loopLengthMs: number | null;
    timingReference: TimingReference;
    /** null when kind = 'none' */
    separationConfidence: SeparationConfidence | null;
    /** 0..1 */
    liveOnsetMatchRate: number | null;
  };
  /** 0..1 per aspect */
  coverage: { audio: number; frettingHand: number; pickingHand: number; posture: number };
  limitations: Limitation[];
  /** Sorted by severity, then by time. */
  points: FeedbackPointOut[];
}

/** An analyser's raw finding, before text is rendered. */
export interface Finding {
  category: Category;
  aspect: Aspect;
  issueCode: IssueCode;
  severity: Severity;
  confidence: number;
  startMs: number;
  endMs?: number;
  metrics: Record<string, number | string>;
}

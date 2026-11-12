/**
 * Every tunable number in the analysis engine lives here (tasks.md T028). No magic numbers elsewhere.
 *
 * Bump ENGINE_VERSION whenever a value changes (the `+tN` part for threshold-only changes), so stored
 * reports can be told apart and progress trends aren't silently mixed across engine versions.
 * Sources: research.md R6 (timing), R7 (technique), R9 (scores), R16 (accompaniment), and
 * contracts/analysis-engine.md.
 */

export const ENGINE_VERSION = '1.0.0+t1';

/** Findings below this confidence are never emitted (contract guarantee 6). */
export const CONFIDENCE_FLOOR = 0.6;

export const AUDIO = {
  sampleRate: 22050,
  /** STFT window and hop in samples (~46 ms / ~11.6 ms). */
  windowSize: 1024,
  hopSize: 256,
  /** Onset detection band (Hz): guitar fundamentals and body, below a metronome click. */
  onsetBandLowHz: 80,
  onsetBandHighHz: 1500,
  /** Peak at or above this (full scale 1.0) counts as clipping. */
  clippingPeak: 0.99,
  /** Below this estimated SNR (dB) a noisy_audio limitation is raised. */
  noisySnrDb: 12,
} as const;

export const ONSETS = {
  /** Adaptive threshold: median of the flux over ±this many frames … */
  medianWindowFrames: 16,
  /** … times this factor, plus this offset (relative to the flux range). */
  thresholdFactor: 1.5,
  thresholdOffset: 0.02,
  /** Minimum gap between onsets (ms): faster than 32nd notes at 220 BPM is treated as one. */
  minInterOnsetMs: 50,
  /** An onset must raise short-term energy: after/before ratio over these windows (ms). */
  energyWindowMs: 25,
  minEnergyRise: 1.3,
  /** A take counts as playing only with at least this many pluck-like onsets (sharp + pitched). */
  minPluckOnsets: 4,
  /** Pluck-like: attack energy (first 15 ms) at least this many times the energy just before … */
  pluckAttackRatio: 4,
  /** … and normalised autocorrelation at a guitar pitch at least this high. */
  pluckPeriodicity: 0.8,
  /** … and pluck-like onsets must be at least this share of all onsets (noise produces chance hits). */
  minPluckShare: 0.25,
} as const;

export const TEMPO = {
  minBpm: 60,
  maxBpm: 220,
  /** Beat period = shortest autocorrelation peak at least this fraction of the strongest. */
  periodPeakFraction: 0.6,
  /** |rushing/dragging| threshold on the mean signed offset (ms). */
  rushDragMs: 25,
  /** Local tempo change over the take that counts as drift (BPM). */
  driftBpm: 3,
  /** Played tempo vs target tempo difference that counts as off target (fraction). */
  offTargetFraction: 0.05,
  /** "Steady": mean |offset| at or below this and drift below driftBpm. */
  steadyMeanAbsMs: 20,
  /** Within-beat offset standard deviation that counts as uneven subdivision (ms). */
  unevenStdMs: 30,
  /** Minimum onsets needed on a beat position to report on that position. */
  minOnsetsPerBeatPosition: 4,
} as const;

export const TECHNIQUE = {
  /** Landmark smoothing (exponential, 0..1, higher = less smoothing). */
  smoothingAlpha: 0.5,
  /** Minimum MediaPipe hand score for a hand to count as visible. */
  minHandScore: 0.5,
  /** Extreme wrist flexion must be held this long to count as strain (ms). */
  wristStrainHoldMs: 5000,
  /** Wrist flexion angle (degrees) counted as extreme. */
  wristExtremeDeg: 45,
  /** Mean PIP-joint angle (degrees) above which fingers count as flat while fretting. */
  flatFingerPipDeg: 155,
  /** Fingertip lift (fraction of hand length) counted as lifting high. */
  fingerLiftHandFraction: 0.35,
  /** Fraction of the take the thumb must be over the neck to report it. */
  thumbOverNeckFraction: 0.6,
  /** Picking-hand stroke amplitude/interval coefficient of variation counted as inconsistent. */
  strumInconsistentCv: 0.35,
  /** A pause longer than this many median stroke intervals counts as stopped motion. */
  strumPauseIntervals: 2.5,
  /** Live-onset confidence needed for clarity findings with accompaniment (guarantee 10). */
  liveClarityConfidence: 0.7,
} as const;

export const FRAMING = {
  /** Frames considered for the framing check. */
  windowFrames: 30,
  /** Both hands must be visible in at least this fraction of frames. */
  bothHandsFraction: 0.8,
  /** Fretting-hand landmarks must stay inside this normalised box. */
  frameMargin: 0.02,
  /** Mean luma below this counts as low light. */
  lowLightBrightness: 0.18,
} as const;

export const SCORING = {
  /** Timing score = 100 × clamp(1 − (meanAbs − floor) / span, 0, 1) − drift penalty (R9). */
  timingFloorMs: 10,
  timingSpanMs: 90,
  /** Up to this many points off for drift above TEMPO.driftBpm … */
  maxDriftPenalty: 15,
  /** … reached at this much drift (BPM). */
  driftPenaltyFullBpm: 10,
  /** Technique score = 100 − Σ(severity weight) per minute, floored at 0. */
  severityWeight: { info: 0, minor: 5, moderate: 12, major: 25 },
  /** Below this coverage of an aspect group the score is null ("not enough data"). */
  minCoverageForScore: 0.3,
} as const;

export const ACCOMPANIMENT = {
  /** Loop lengths searched (ms). */
  minLoopMs: 1000,
  maxLoopMs: 60000,
  /** ahead/behind threshold vs the accompaniment grid (ms). */
  aheadBehindMs: 20,
  /** A stretch shifted by at least this many beats = lost place in the loop. */
  lostPlaceBeats: 0.25,
  /** Onset ↔ picking-stroke match window (ms). */
  strokeMatchMs: 50,
  /** Onset ↔ click match window (ms). */
  clickMatchMs: 15,
  /** Separation confidence from the residual's share of the mix energy (see attribution.ts). */
  goodShare: 0.1,
  partialShare: 0.04,
  tooLoudShare: 0.03,
  /** Fewer loop cycles than this → too_few_loop_cycles. */
  minLoopCycles: 2,
  /** Waveform self-correlation at the loop length needed to call it a loop (a looper repeats exactly). */
  loopMinCorrelation: 0.12,
  /** A click track repeats with less timing jitter than this (ms, std of the gaps). */
  clickMaxJitterMs: 1,
  /** … and its transients carry less than this share of energy in the guitar range (< 1.5 kHz). */
  clickMaxGuitarShare: 0.3,
  /** Backing: share of energy below this frequency (kick, bass) … */
  backingLowHz: 70,
  /** … at least this share … */
  backingMinLowShare: 0.03,
  /** … plus noisy high-frequency hits (hats) at least this often per second. */
  backingMinHitRate: 1,
} as const;

export const LANDMARKS = {
  /** Live hand-tracking rate during recording (no device tiering in v1). */
  fps: 12,
} as const;

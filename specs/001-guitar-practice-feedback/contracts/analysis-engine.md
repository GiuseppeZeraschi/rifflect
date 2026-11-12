# Contract: Analysis Engine (`src/analysis`)

The engine is pure TypeScript with no React Native imports. It runs on the phone in a background worklet and in Node for tests and evaluation ([research R5](../research.md#r5-where-the-analysis-code-runs-typescript-core-vs-c)). The app depends only on this public interface.

## Entry point

```ts
analyseTake(input: AnalysisInput, opts?: AnalysisOptions): Promise<AnalysisResult>
```

- **Deterministic**: the same input and `ENGINE_VERSION` always give the same output.
- **No I/O**: the caller provides decoded PCM and parsed landmarks.
- **Progress and cancelling**: reports progress through `opts.onProgress(0..1)` and can be cancelled with `opts.signal: AbortSignal`.

## Input

```ts
interface AnalysisInput {
  audio: { sampleRate: 22050; samples: Float32Array };   // mono, full take
  landmarks: LandmarkFrame[] | null;                     // null → technique limited to audio
  durationMs: number;                                    // 5_000..300_000
  player: { handedness: 'right' | 'left'; skillLevel: 'beginner' | 'intermediate' | 'advanced' };
  cameraPosition: 'front' | 'back';
  targetTempoBpm?: number;             // 30..300, optional goal; hint + comparison only
  accompaniment: 'auto' | 'on' | 'off'; // FR-024
  landmarksMirrored?: boolean;          // default false (frames un-mirrored); set from frame.isMirrored
  interrupted?: boolean;                // recording ended abnormally → take_interrupted limitation
}

interface LandmarkFrame {
  tMs: number;                                   // recording clock, same as audio
  hands: { side: 'Left' | 'Right'; score: number; pts: [number, number, number][] /* 21 */ }[];
}
```

## Output

```ts
interface AnalysisResult {
  engineVersion: string;
  status: 'analysed' | 'no_playing';
  timingScore: number | null;          // 0..100
  techniqueScore: number | null;       // 0..100
  summary: string;                     // ≤ 140 chars, skill-level tone
  tempo: { bpm: number | null; driftBpm: number | null; meanAbsOffsetMs: number | null; targetDeltaBpm: number | null };
  accompaniment: {
    kind: 'none' | 'loop' | 'backing' | 'click';
    loopLengthMs: number | null;
    timingReference: 'own_playing' | 'accompaniment';
    separationConfidence: 'good' | 'partial' | 'poor' | null;   // null when kind = 'none'
    liveOnsetMatchRate: number | null;                          // 0..1
  };
  coverage: { audio: number; frettingHand: number; pickingHand: number; posture: number }; // 0..1
  limitations: { code: LimitationCode; message: string; fromMs?: number; toMs?: number }[];
  points: FeedbackPointOut[];          // sorted by severity, then by time
}

interface FeedbackPointOut {
  category: 'timing' | 'technique';
  aspect: 'tempo' | 'rhythm' | 'fretting_hand' | 'picking_hand' | 'clarity' | 'posture';
  issueCode: IssueCode;
  severity: 'info' | 'minor' | 'moderate' | 'major';
  confidence: number;                  // ≥ CONFIDENCE_FLOOR (0.6)
  startMs: number; endMs?: number;
  observation: string;                 // what + where (FR-009)
  suggestion: string;                  // concrete improvement (FR-009)
  metrics: Record<string, number | string>;
}
```

## Guarantees (tested)

1. **No playing found**: if the take contains no detectable guitar playing (speech, silence: fewer than 4 pluck-like onsets, i.e. a sharp attack followed by a clearly pitched sound in the guitar range), the result has `status = 'no_playing'`, `points = []` and both scores `null`. The engine never makes up findings (FR-012). With accompaniment, this applies to the *live* playing: a take where only the loop or backing track is heard, with no live onsets attributed, is `no_playing`.
2. **Something said about each category**: when `status = 'analysed'`, the result contains ≥ 1 `timing` point and ≥ 1 `technique` point. A category with nothing to fix gets a positive `info` point (e.g. `timing.steady`). A category that could not be assessed instead has a `limitations` entry and a `null` score.
3. **Valid times**: every `startMs` is in `[0, durationMs]`.
4. **Tempo reference**: timing metrics are always measured against the beat grid estimated from the player's own playing. If `targetTempoBpm` is given, it is used to resolve half/double-tempo ambiguity, `tempo.targetDeltaBpm` is set, and a `timing.off_target_tempo` point is emitted when the difference is more than 5% (FR-007, Story 1 scenario 3).
5. **Left-handed players**: with `handedness = 'left'`, the fretting and picking hand roles are swapped. MediaPipe assumes selfie (mirrored) input, so on un-mirrored frames its labels are flipped; the engine corrects this, and uses the labels as-is when `landmarksMirrored` is true.
6. **Text tone**: text depends only on `issueCode`, metrics and `skillLevel`, and is rendered from the template catalogue (FR-011).
7. **Performance**: a 60-second input finishes in ≤ 10 s on the Nothing Phone (4a), release build (the budget for the analysis stage within SC-002's 30 s). This includes accompaniment processing.
8. **Accompaniment setting**:
   - `accompaniment = 'off'` → `accompaniment.kind = 'none'`, and the result is identical to the solo pipeline.
   - `'on'` → the accompaniment pipeline always runs. If no repetition is found, it is treated as `backing`.
   - `'auto'` → the pipeline runs only if it is detected (research R16).
9. **Timing against the accompaniment**: when `accompaniment.kind ≠ 'none'`, `timingReference = 'accompaniment'`. Timing points describe only live onsets relative to the accompaniment grid. No onset attributed to the accompaniment ever appears in a point's metrics (FR-026, FR-027).
10. **Clarity only on live notes**: with accompaniment, `clarity` points are emitted only for onsets attributed as live with confidence ≥ 0.7. When `separationConfidence = 'poor'`, no clarity points are emitted, and an `accompaniment_separation_low` limitation is present (FR-028).
11. **Hand tracking unaffected**: the fretting-hand and picking-hand landmark analysers are unaffected by accompaniment, and their output is identical in both modes for the same landmarks.

## Issue codes

Issue codes are stable. Any change is a minor `engineVersion` bump, and old codes stay in the catalogue so history still displays.

| Code | Category / aspect | Signal |
|---|---|---|
| `timing.steady` | timing/rhythm | positive: low offset, low drift |
| `timing.rushing` | timing/rhythm | mean signed offset < −25 ms (overall or on a beat position) |
| `timing.dragging` | timing/rhythm | mean signed offset > +25 ms |
| `timing.uneven_subdivision` | timing/rhythm | high variance of offsets within a beat |
| `timing.tempo_drift_up` / `timing.tempo_drift_down` | timing/tempo | local tempo change > 3 BPM over the take |
| `timing.off_target_tempo` | timing/tempo | played tempo differs from the entered target tempo by > 5% |
| `timing.locked_to_accompaniment` | timing/rhythm | positive, accompaniment only: live onsets are tight to the accompaniment grid |
| `timing.ahead_of_accompaniment` | timing/rhythm | accompaniment only: live onsets are on average > 20 ms before the accompaniment grid (overall or on a beat position) |
| `timing.behind_accompaniment` | timing/rhythm | accompaniment only: live onsets are on average > 20 ms after the grid |
| `timing.lost_place_in_loop` | timing/rhythm | accompaniment only: a stretch of live onsets moves consistently by ≥ ¼ beat, i.e. the player has lost their place in the loop |
| `technique.clean` | technique/clarity | positive: no clarity issues |
| `technique.fret_buzz` | technique/clarity | buzz signature right after an onset |
| `technique.muted_notes` | technique/clarity | note decays abnormally fast |
| `technique.unwanted_open_strings` | technique/clarity | unexpected open-string partials keep sounding |
| `technique.fret_thumb_over_neck` | technique/fretting_hand | thumb tip above the neck line for a long stretch (context-dependent; severity `info` for chords) |
| `technique.flat_fingers` | technique/fretting_hand | low PIP-joint curvature while fretting |
| `technique.fingers_lifting_high` | technique/fretting_hand | large fingertip distance from the fretboard between notes |
| `technique.wrist_strain` | technique/fretting_hand or posture | extreme wrist flexion held for > 5 s |
| `technique.inconsistent_strum` | technique/picking_hand | high variance in stroke size or timing |
| `technique.stopped_strum_motion` | technique/picking_hand | hand pauses between strokes in a strumming pattern |

## Limitation codes

`hands_not_visible`, `fretting_hand_out_of_frame`, `low_light`, `noisy_audio`, `clipping_audio`, `landmarks_missing`, `posture_not_assessed`, `tempo_not_detected`, `take_interrupted`, `accompaniment_separation_low`, `accompaniment_too_loud`, `accompaniment_changed` (overdub, stop/restart, varispeed), `unison_with_accompaniment`, `too_few_loop_cycles`.

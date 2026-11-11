# Phase 0 Research: AI Guitar Practice Feedback

**Feature**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md) | **Date**: 2026-11-11

The user decided on React Native, so the app runs on Android and iPhone from one codebase. From clarification, all analysis runs on the phone and feedback is given only after each take. The user later decided to drop the built-in metronome (see R10), and to fully support playing over a loop pedal or backing track (see R16). The decisions below follow from these constraints.

---

## R1. React Native setup: Expo (dev builds) vs bare React Native CLI

- **Decision**: Expo with the latest stable SDK at project start, using **development builds** (`expo prebuild` / EAS Build) with the New Architecture enabled. Expo Go is not used. TypeScript in strict mode.
- **Rationale**: We need custom native code (audio decoding, MediaPipe hand tracking, camera frame processors). Dev builds support that and still give us Expo's maintained modules (file system, SQLite, video, media library), config plugins and EAS Build. EAS Build matters here: the main development machine runs Windows and cannot build iOS locally.
- **Alternatives considered**:
  - *Bare RN CLI*: the same native access, but we would maintain native project files by hand and need our own iOS CI or a Mac.
  - *Expo Go only*: cannot load the custom native modules this app needs.
  - *Flutter / native Swift + Kotlin*: rejected because the user asked for React Native.

## R2. Camera and audio capture

- **Decision**: **react-native-vision-camera** (v4+) records video with audio to an `.mp4`/`.mov` file in the app's private storage. Its **frame processors** run hand tracking on live frames during recording and during the framing preview.
- **Rationale**: It is the most capable RN camera library. It records audio and video together (FR-001), lets us pick the camera and format, and its frame processors run synchronously on a worklet thread. Native plugins can be attached to them, which we need for on-device hand tracking.
- **Alternatives considered**: *expo-camera*: simpler, but its frame-processing support is not mature enough to run per-frame ML.

## R3. On-device hand/pose tracking (technique analysis)

- **Decision**: Use **MediaPipe Tasks Hand Landmarker** (official Google SDKs: `MediaPipeTasksVision` on iOS, `com.google.mediapipe:tasks-vision` on Android). It is wrapped in a local Expo module that registers a VisionCamera frame-processor plugin (`detectHands`). It runs at ~12 fps during recording. Each frame produces 21 landmarks per hand plus a handedness label and confidence, appended to a per-take landmark file (JSON Lines) with timestamps on the recording's clock.
- **Rationale**:
  - Hand landmarks are the most useful signal for the technique items in FR-008: fretting-hand shape and thumb position, and picking/strumming-hand motion.
  - MediaPipe is free, runs on-device on both platforms, and is fast enough on mid-range phones.
  - Running it live does the expensive vision work while the user plays, so after a take only the cheaper audio analysis remains. That is what makes the SC-002 target (feedback in under 30 seconds) achievable.
  - The same plugin also drives the framing check before recording (FR-002, Story 1 scenario 4).
- **Alternatives considered**:
  - *Post-take frame extraction*: decode the saved video and run the landmarker in VIDEO mode. Timestamps align exactly, but on mid-range phones it would add roughly 10–20 s per minute of video and break SC-002. **This is kept as the fallback** for takes where the live landmark stream is missing, e.g. after an interruption.
  - *react-native-fast-tflite with raw MediaPipe .tflite models*: we would have to implement palm detection, cropping and landmark stages ourselves. More work for the same result.
  - *Full-body pose (MediaPipe Pose)*: considered for the posture item in FR-008. Deferred: v1 gives posture advice only from hand and wrist geometry plus a one-off framing check, and says what it could not assess (FR-012).
- **Known limitations**:
  - The front camera mirrors handedness labels, so we correct them using camera position and the user's handedness from their profile (FR-005).
  - v1 does not detect the guitar neck itself. Framing guidance relies on both hands being visible, the fretting hand being fully in frame, and enough light.

## R4. Getting audio for analysis

- **Decision**: Use a local Expo module, `rifflect-audio-decoder`, to decode the audio track of the recorded video to **mono 22,050 Hz Float32 PCM**. iOS uses `AVAssetReader` and Android uses `MediaExtractor` + `MediaCodec`. The PCM is written to a temp file and memory-mapped or streamed in chunks to JS.
- **Rationale**: Audio decoded from the saved file shares the video's timeline, so audio and landmarks line up (both use presentation time). We avoid running a second microphone session alongside the camera. 22.05 kHz is enough for guitar onset and pitch analysis and halves the data compared with 44.1 kHz.
- **Alternatives considered**: *Separate audio recording in parallel*: two microphone users conflict with the camera's audio session, and clock drift needs correcting.

## R5. Where the analysis code runs: TypeScript core vs C++

- **Decision**: The analysis engine is **pure TypeScript** in `src/analysis/`. It has no React Native imports and is fed typed arrays. It runs off the UI thread via a worklet/background runtime (`react-native-worklets-core` or equivalent), so the UI stays responsive. The heavy loops (FFT, spectral flux, autocorrelation) sit behind one `dsp` interface so they can be swapped for a C++/JSI implementation (Nitro Modules) if benchmarks miss the target.
- **Rationale**:
  - The same code runs in Jest and in Node, so the analysis can be unit-tested with audio and landmark fixtures.
  - The accuracy evaluation harness for SC-003 can run on a desktop over a labelled corpus.
  - Rough estimate: a 1-minute take at 22.05 kHz with a 1024-sample window and 256-sample hop is about 5,200 FFT frames, which takes 1–3 s in Hermes. Well within budget.
- **Alternatives considered**: *C++ from day one*: faster, but desktop testing is harder and native work increases before we know we need it. *Essentia / aubio*: large native dependencies, and licensing (AGPL/GPL) makes them unsuitable for an app-store app.

## R6. Timing analysis method

- **Decision**:
  1. **Onset detection**: spectral flux on a log-magnitude STFT, limited to roughly 80 Hz–1.5 kHz, with adaptive peak picking.
  2. **Beat grid**: tempo is estimated by autocorrelating the onset-strength envelope (60–220 BPM). A beat grid with a local tempo is then fitted using dynamic-programming beat tracking. The app has no metronome (FR-003), so the grid always comes from the player's own playing. If the user entered a target tempo, it is used only as a hint to resolve half/double-tempo ambiguity and to report "played at X BPM vs target Y".
  3. **Metrics**:
     - Signed offset of each onset from the nearest grid subdivision (beat, eighth or sixteenth note, whichever best explains the onsets).
     - Mean absolute offset in ms, tendency to play early (rushing) or late (dragging) per beat position, and tempo drift in BPM across the take.
- **Known limitation**: a player who is consistently unsteady can pull the fitted grid with them, which understates timing errors. Drift and the spread of offsets within a beat are still reported, and a built-in metronome is a possible future addition.
- **Loop, backing track or external metronome**: handled by accompaniment-aware analysis ([R16](#r16-playing-over-a-loop-or-backing-track-story-4)). The beat grid then comes from the accompaniment, not the player.
- **Rationale**: These are standard music-information-retrieval methods that run in real time, are deterministic and testable, and need no ML model to download.
- **Alternatives considered**: *A neural beat tracker (e.g. a madmom-style RNN)*: more accurate on complex music, but large and slow on a phone, and unnecessary for single-instrument practice takes.

## R7. Technique analysis method

- **Decision**: Rule-based **analysers** that each emit findings with a stable `issueCode`:
  - **Fretting hand** (landmarks): thumb wrapped over or behind the neck, fingers flattened (low curvature at the PIP joints), wrist bent sharply, fingers lifting high off the fretboard between notes.
  - **Picking/strumming hand** (landmark trajectories plus onsets): whether stroke size stays consistent, whether strokes are evenly spaced compared with the audio onsets, and whether the hand stops moving between strokes when it should keep going.
  - **Note clarity** (audio): string buzz, detected as broadband high-frequency energy plus inharmonicity just after an onset; dead or muted notes, detected as unusually fast decay; and unintended open strings, detected as unexpected low partials that keep sounding.
  - **Posture** (limited): sustained wrist angles at the extremes of the hand-tracking range, and the frame being cut off. Anything we cannot judge is reported as "not assessed".
- Each analyser reports a **confidence**. Low-confidence findings are suppressed, and the reasons are reported in `limitations` (FR-012).
- **Rationale**: Rule-based analysers are explainable, can be checked against what a teacher would say (SC-003), are deterministic for tests, and don't need training data before v1. Thresholds are kept in versioned config so they can be tuned on the evaluation corpus.
- **Alternatives considered**: *A trained end-to-end technique classifier*: needs a large labelled dataset we don't have. Revisit once the evaluation corpus grows.

## R8. Turning findings into feedback text (FR-009, FR-011)

- **Decision**: **Templated text**. Each `issueCode` has an observation template and a suggestion template, with variants for beginner, intermediate and advanced players. Templates are filled with measured values such as "about 40 ms early on beat 4". The overall summary is built from the top 1–3 findings, ranked by severity.
- **Rationale**:
  - Works offline on every device, is deterministic and testable, and costs nothing per take.
  - Feedback quality depends on what the analysers detect, not on clever wording.
- **Alternatives considered**: *On-device LLM rewording* (Apple Foundation Models, Android Gemini Nano): only available on recent high-end phones and not deterministic. Possible future enhancement behind a flag. *Cloud LLM*: ruled out by FR-014.

## R9. Scores (FR-010)

- **Decision**:
  - **Timing score** = 100 × clamp(1 − (mean |offset| − 10 ms) / 90 ms, 0, 1). It is then reduced by up to 15 points for tempo drift above 3 BPM.
  - **Technique score** = 100 minus the severity-weighted findings per minute, capped at 0. It is computed only from aspects that were actually assessed.
  - Either score is `null` (shown as "not enough data") when too little of the take could be analysed.
- **Rationale**: Easy to explain, and gives stable trends over time (FR-020). The constants are configuration, tuned on the evaluation corpus, and every report records `analysisVersion` so results from different versions can be told apart.

## R10. Metronome (removed)

- **Decision**: no built-in metronome or count-in in v1 (user decision, 2026-11-11). The app plays no audio while recording. This removes the shared audio-session risk (camera recording and click playback at the same time), metronome bleed handling and per-device latency calibration. An optional typed target tempo remains (FR-003) and is used only for comparison (R6).

## R11. Local storage (FR-015 – FR-019)

- **Decision**:
  - **Videos and landmark files**: app-private documents directory via `expo-file-system`, one folder per take (`takes/<takeId>/video.mp4`, `landmarks.jsonl`).
  - **Metadata, reports and findings**: **SQLite** (`expo-sqlite`) with **Drizzle ORM** for typed schema and migrations, using live queries for reactive screens.
  - **Export**: `expo-media-library` saves a copy to the camera roll, and the system share sheet shares to other apps.
  - **Space**: storage used is the sum of take folder sizes; free space is read before recording and before saving (FR-017).
- **Rationale**: Everything stays on the phone and works offline (FR-018). App-private storage keeps takes out of the camera roll unless the user exports them. SQLite handles the progress and recurrence queries (FR-020, FR-021) efficiently.
- **Alternatives considered**: *MMKV / AsyncStorage*: too weak for relational and aggregate queries. *Saving straight to the camera roll*: exposes unsaved and draft takes and makes cleanup harder.

## R12. UI stack

- **Decision**:
  - **Screens**: `expo-router` for file-based navigation.
  - **Playback**: `expo-video`, including seeking to a feedback point (FR-013).
  - **Charts**: `victory-native` (Skia) for progress charts.
  - **App state**: `zustand` for small amounts of UI and session state.
  - **Accessibility**: screen-reader labels, and dynamic type for the text-heavy feedback screens.
- **Rationale**: These are maintained, widely used libraries that work with the New Architecture.

## R13. Analysis lifecycle and interruptions

- **Decision**:
  - **Job queue**: analysis runs as an in-app job keyed by `takeId`. A take moves through `recorded → analysing → analysed | failed | no_playing`, and the status is stored in SQLite.
  - **Restarts**: on app start, takes left in `recording` or `analysing` are recovered. Partial video is finalised where the platform allows, and the take is offered for re-analysis or discard (spec edge cases).
  - **Leaving the screen**: analysis carries on while the user moves around the app.
  - **No OS background processing in v1**: if the app is backgrounded long enough to be suspended, the job resumes on return.
- **Rationale**: Simple and reliable. OS background tasks for heavy work behave inconsistently between iOS and Android.

## R14. Device floor (spec assumption, SC-002)

- **Decision**: Minimum devices for v1: **iOS 16+** on iPhone XR/A12 or newer, and **Android 8.0+ (API 26)** with 4 GB RAM. On iPhone 12/A14 or newer and on Android phones with a Snapdragon 7-series (2021+) or equivalent, the target is the 30-second SC-002 budget for a 1-minute take. On weaker phones, analysis runs at a lower landmark rate (8 fps) and shows progress.
- **Rationale**: MediaPipe and VisionCamera requirements plus the Expo SDK floor. To be confirmed by the performance spike on real devices.

## R15. Testing and accuracy evaluation

- **Decision**:
  - **Unit (Jest)**: analysis core with synthetic signals (pulse trains at known offsets, generated jitter), plus scoring and text templates.
  - **Fixture tests**: real recorded guitar clips, with landmark JSONL files, checked into `tests/fixtures/`, each with expected findings.
  - **Component tests**: React Native Testing Library for screens.
  - **Data layer**: Drizzle repository tests using SQLite in Node (`better-sqlite3` with the same schema).
  - **End-to-end**: **Maestro** flows on emulator/simulator and on real devices (camera and mic need a physical device for the full flow).
  - **Accuracy harness (SC-003)**: `tools/eval/` runs the analysis core in Node over a labelled corpus. Landmarks are produced by MediaPipe Python with the same `.task` model. The harness reports how often our findings match teacher labels.
  - **Performance harness (SC-002)**: an on-device benchmark screen in dev builds, timing analysis for 1-minute and 5-minute fixtures.
  - **Accompaniment fixtures (SC-008, SC-009)**: synthetic mixes are built in the test suite. A clean solo lead recording is mixed with a looped rhythm part at known gain ratios, so the true live onsets are known exactly. These are added to real lead-over-loop takes in the evaluation corpus.

## R16. Playing over a loop or backing track (Story 4)

The phone has one microphone, which hears the live guitar and the accompaniment mixed together. Both are often the same guitar through the same amp, so filtering by frequency band can't separate them. The approach uses two facts: a **looper repeats exactly**, and the **camera sees only the live hands**.

- **Decision: a four-stage accompaniment pipeline** inside the analysis engine (`src/analysis/accompaniment/`), active when the setting is On, or Auto and accompaniment is detected:
  1. **Detection and loop length**:
     - **Method**: compute a self-similarity measure over beat-synchronous chroma and spectral features, and autocorrelate it across lags from 1 to 60 s. A loop shows up as a strong, sharp peak at its exact length, repeated at whole-number multiples.
     - **Classification**:
       - *loop*: a sharp, exact repetition.
       - *backing*: a strong steady pulse without an exact repeat.
       - *click*: a regular train of short broadband transients unlike guitar.
       - *none*: none of the above.
     - **Auto mode**: uses this classification, with thresholds tuned against SC-008 (≥ 90% detection, ≤ 5% false alarms).
  2. **Timing reference from the accompaniment**:
     - **Loop**: tempo and beat phase come from the repeating component (step 3). Because the loop length is exact, it pins the tempo down very precisely. The bar length is the loop length divided by a whole number of bars, and the beat count is chosen as the one that best explains onsets in the repeating part.
     - **Click**: the click transients themselves form the grid.
     - **Backing track**: beat tracking runs on the full mix, where the accompaniment dominates the pulse.
  3. **Separating the live playing (REPET)**:
     - **Method**: REPET (REpeating Pattern Extraction Technique), an established and lightweight music-separation method. Take the median of the magnitude spectrogram across loop repetitions to get a model of the repeating part. Then apply a soft time-frequency mask to get a "live residual" signal.
     - **Changing loops**: windowed/adaptive REPET, where the repeating model is re-estimated over a sliding window of a few cycles. This copes with overdub layers being added, and with the loop starting or stopping.
     - **Backing tracks that don't repeat**: REPET-Sim, which repeats on similar frames instead of a fixed period, gives weaker separation, and confidence is lowered.
     - **Click**: no spectral separation is needed. Onsets that fall within ±15 ms of a click and have a click-like spectrum are removed.
     - **Output**: onset detection, clarity analysis and pitch-based checks then run on the **live residual**, not the mix.
  4. **Checking which notes are live, using the camera**:
     - **Method**: match each remaining onset against picking-hand strokes from the landmark stream (a velocity peak, then a change of direction, within ±50 ms).
     - **Scoring**:
       - Matched onsets are live with high confidence.
       - Unmatched onsets with strong residual energy are kept as probable legato notes (hammer-on, pull-off, tap), at lower confidence.
       - Unmatched onsets with weak residual energy are dropped.
     - **Separation confidence**: combines the mask energy ratio and the onset↔stroke match rate into good / partial / poor (FR-028).
     - **Effect on feedback**: clarity findings (buzz, muted notes, open strings) are only emitted for onsets attributed as live with confidence ≥ 0.7, and are suppressed entirely when confidence is poor.
- **Why this approach**:
  - **Fits the looper**: REPET is designed for exactly the case where the background repeats and the foreground doesn't.
  - **Cheap enough for the phone**: it needs no trained model, runs on the STFT the engine already computes, and costs about one median over N repeats per frequency bin.
  - **Fits the memory budget**: a 5-minute take at 22.05 kHz with a 256-sample hop is about 26k frames × 513 bins ≈ 54 MB as Float32, within the 300 MB limit.
  - **Camera check**: comes almost for free because landmarks are already captured, and it fixes REPET's main weakness. When the lead plays close to the loop's own notes, the residual is ambiguous, and the picking hand shows which notes are actually being played.
- **Time cost**: roughly +2–5 s per minute of audio on the reference device. Still within SC-002 for a 1-minute take, but the time budget must be checked in the benchmark with an accompaniment fixture.
- **Alternatives considered**:
  - *Neural source separation (e.g. Demucs/Spleeter-class models)*: high quality, but models of tens to hundreds of MB that are slow on phones, and they separate by instrument type, not live vs. recorded. Guitar over guitar is exactly the case they can't handle.
  - *Separate inputs via a multi-channel USB audio interface*: perfect separation, but extra hardware and inconsistent multi-channel USB audio support on phones. Out of scope for v1 (spec assumption).
  - *Detect and warn only*: much cheaper, but the user practises this way often, so it was ruled out in favour of full support (user decision, 2026-11-11).
- **Known limitations** (reported, not hidden, FR-012):
  - **Unison**: a live part that doubles the loop exactly can't be separated.
  - **Single-pass loops**: very short takes with fewer than 2 loop cycles give no repeating model, so the engine falls back to backing-track handling.
  - **Variable-speed loopers**: loopers that change speed or reverse playback break the exact-repetition assumption, and are flagged as `accompaniment_changed`.

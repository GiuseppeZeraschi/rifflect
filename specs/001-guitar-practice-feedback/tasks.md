---

description: "Task list for AI Guitar Practice Feedback (Rifflect)"
---

# Tasks: AI Guitar Practice Feedback

**Input**: Design documents from `specs/001-guitar-practice-feedback/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Tests**: This list includes test tasks for the **analysis engine**, the **data layer**, the **job queue** and the **key screens**. They are included because [contracts/analysis-engine.md](./contracts/analysis-engine.md) defines guarantees marked as tested, and [quickstart.md](./quickstart.md) defines automated checks (`npm test`, `npm run test:analysis`, Maestro flows). Write the engine and data-layer tests first, and make sure they fail before you implement.

**Organization**: Tasks are grouped by user story. The phases follow the spec's priorities: US1 (P1) → US2 (P2) → US4 (P2) → US3 (P3). Story labels match the story numbers in [spec.md](./spec.md).

**Scope**: v1 is Android-only, for personal use on the owner's Nothing Phone (4a), installed as a signed release APK ([research.md R17](./research.md#r17-distribution-and-data-safety-personal-use)). iOS native work is listed under **Deferred: iOS** at the end and is not part of v1. Tasks marked **(optional)** are worth doing but don't block v1.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no dependency on unfinished tasks)
- **[Story]**: the user story the task belongs to (US1–US4)
- **(human)**: needs a person with a guitar, a physical device or labelled data; an agent cannot complete it alone
- **(device)**: native code that can only be verified on the Nothing Phone (4a) with a locally built development or release build
- **(optional)**: not required for v1

## Path Conventions

This is a single Expo/React Native app at the repository root ([plan.md § Project Structure](./plan.md#project-structure)):
- **App code**: `app/` (expo-router routes) and `src/` (logic)
- **Local native modules**: `modules/`
- **Tests**: `tests/`, plus a Maestro smoke flow in `e2e/`
- **Build tooling**: `plugins/` (Expo config plugins, e.g. release signing)
- **Evaluation tooling**: `tools/eval/`
- **Analysis engine**: the engine in `src/analysis/` MUST NOT import `react-native`, `expo-*` or any native module

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialisation, tooling and configuration.

- [X] T001 Initialise an Expo TypeScript app at the repository root using the expo-router tabs template. Set the name to "Rifflect", the slug to `rifflect`, and the Android `package` (and the iOS `bundleIdentifier`, for later) to `com.rifflect.app`. Enable the New Architecture (`newArchEnabled: true`) in `app.json`. Keep the existing `.gitignore`, `.gitattributes`, `LICENSE`, `.specify/`, `.claude/` and `specs/`
- [X] T002 Install the runtime dependencies from [plan.md § Technical Context](./plan.md#technical-context) into `package.json`:
  - Camera and frame processing: `react-native-vision-camera` (v5), `react-native-nitro-modules`, `react-native-nitro-image`, `react-native-vision-camera-worklets`, `react-native-worklets` (already in the template)
  - Storage: `expo-sqlite`, `drizzle-orm`, `expo-file-system`, `expo-media-library`, `expo-sharing`
  - Video and UI: `expo-video`, `expo-video-thumbnails`, `expo-router`, `victory-native`, `@shopify/react-native-skia`, `zustand`, `expo-dev-client`
  - Utilities: `uuid` (with v7 support)

  Install the dev dependencies:
  - `drizzle-kit`, `better-sqlite3`, `@types/better-sqlite3`
  - `jest`, `jest-expo`, `@testing-library/react-native`, `ts-node`

  Use `npx expo install` wherever a package has an Expo-pinned version.
- [X] T003 [P] Configure `tsconfig.json`: `"strict": true`, `"noUncheckedIndexedAccess": true`, and the path alias `"@/*": ["src/*"]` (mirror the alias in `babel.config.js` via `babel-plugin-module-resolver`)
- [X] T004 [P] Configure ESLint (flat config, `eslint-config-expo`) in `eslint.config.js`. Add a `no-restricted-imports` rule that blocks `react-native`, `expo*` and `@/native/*` inside `src/analysis/**`. Add `.prettierrc`. Add npm scripts `lint`, `typecheck` (`tsc --noEmit`) and `format` in `package.json`
- [X] T005 [P] Configure Jest in `jest.config.js` with two projects:
  - `node`: `testEnvironment: node`, ts-jest or babel-jest, matching `tests/analysis/**`, `tests/unit/**` and `tests/helpers/**`
  - `app`: preset `jest-expo`, matching `tests/components/**`

  Add npm scripts: `test` (all), `test:analysis` (`jest --selectProjects node tests/analysis`), and `eval` (`ts-node tools/eval/run.ts`)
- [X] T006 [P] Create the empty folder skeleton from [plan.md](./plan.md#source-code-repository-root), with an `index.ts` placeholder where a barrel is expected:
  - `src/analysis/{dsp,timing,technique,accompaniment,scoring,feedback-text,config}/`
  - `src/{capture,jobs,data/db,data/repositories,data/files,native,features,ui,lib}/`
  - `tests/{unit,analysis,fixtures,components,helpers}/`
  - `e2e/`, `tools/eval/`
- [ ] T007 [P] Set up release signing and APK scripts ([research.md R17](./research.md#r17-distribution-and-data-safety-personal-use)):
  - **Config plugin** `plugins/withReleaseSigning.js`, registered in `app.json` `plugins`: on `expo prebuild`, add a `release` `signingConfig` to `android/app/build.gradle` that reads `RIFFLECT_STORE_FILE`, `RIFFLECT_KEY_ALIAS`, `RIFFLECT_STORE_PASSWORD` and `RIFFLECT_KEY_PASSWORD` from Gradle properties (the user-level `~/.gradle/gradle.properties`), and use it for the `release` build type. If the properties are missing, fail the release build with a clear message rather than falling back to the debug key.
  - **npm scripts** in `package.json`: `build:apk` (`expo prebuild --platform android` then `gradlew assembleRelease` in `android/`; use `gradlew.bat` on Windows) and `install:apk` (`adb install -r android/app/build/outputs/apk/release/app-release.apk`).
  - **Never commit** the keystore or passwords; the existing `.gitignore` already excludes `*.jks` and `*.keystore`.
  - **README section** (keystore creation command, where the passwords go, backup advice, and the warning that losing the key or mixing debug and release installs forces an uninstall that deletes all takes), copied from [quickstart.md](./quickstart.md#release-build-and-install-daily-use).
- [X] T008 [P] Add permissions and config plugins in `app.json`:
  - **VisionCamera**: use its Expo config plugin if v5 ships one; otherwise add the permissions below directly
  - **Android permissions**: `CAMERA`, `RECORD_AUDIO`
  - **Plugins**: `expo-media-library` (save-only), `expo-sqlite`
  - **Backup**: `android.allowBackup: false`, so Android Auto Backup can never restore the database and video files out of step ([research.md R17](./research.md#r17-distribution-and-data-safety-personal-use))
  - **iOS usage strings** (harmless now, needed later): `NSCameraUsageDescription` ("Rifflect uses the camera to see your hands while you play"), `NSMicrophoneUsageDescription` ("Rifflect listens to your playing to give timing feedback"), `NSPhotoLibraryAddUsageDescription` ("Save your takes to Photos when you choose to export them")
- [X] T009 [P] Download the MediaPipe Hand Landmarker model (`hand_landmarker.task`, float16, from Google's MediaPipe model page) to `assets/models/hand_landmarker.task`. Record its source URL and SHA-256 in `assets/models/README.md`. Add `task` to `resolver.assetExts` in `metro.config.js`
- [X] T010 [P] Create the Maestro config `e2e/config.yaml` (appId `com.rifflect.app`) and a smoke flow `e2e/smoke.yaml` that launches the app and asserts the onboarding screen is visible

**Checkpoint**: `npm run typecheck`, `npm run lint` and `npm test` (no tests yet) run cleanly. `npx expo prebuild --platform android` succeeds. `npm run build:apk` produces a release APK signed with your keystore, and `npm run install:apk` installs it on the phone.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The database, file storage, native modules, device spikes, analysis core types, DSP, job queue and app shell. Every user story depends on these.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete. The spike results (T025–T026) can change how US1 captures hand landmarks.

### Data layer

- [X] T011 Create the Drizzle schema in `src/data/db/schema.ts` for all tables in [data-model.md](./data-model.md). Use UUID v7 text primary keys and ISO-8601 UTC text timestamps. Encode the enums as text with TypeScript unions. Tables and their constraints:
  - **`player_profile`**:
    - `id` "always `"me"`"
    - `handedness` enum `right` | `left` "required"
    - `skillLevel` enum `beginner` | `intermediate` | `advanced` "required"
    - `preferredCamera` enum `front` | `back` "default `front`"
    - `lastAccompanimentSetting` enum `auto` | `on` | `off` "default `auto`"
    - `createdAt`, `updatedAt`
  - **`practice_item`**:
    - `name` "1–60 chars, trimmed, unique ignoring case" (unique index on `lower(name)`)
    - `createdAt`, `lastUsedAt`
  - **`take`**: all fields in data-model.md § Take, including:
    - `practiceItemId` nullable FK (`ON DELETE SET NULL`)
    - `title` "≤ 80 chars"
    - `durationMs` "5,000–300,000 for analysis"
    - `targetTempoBpm` "30–300"
    - `accompanimentSetting` enum `auto` | `on` | `off` "default `auto`"
    - `captureStatus` enum `recording` | `complete` | `partial`
    - `analysisStatus` enum `pending` | `analysing` | `analysed` | `failed` | `no_playing` | `too_short`
    - `saved` bool default false, `interrupted` bool default false
  - **`feedback_report`**: all fields in data-model.md § FeedbackReport:
    - `takeId` unique FK with cascade delete
    - `timingScore` / `techniqueScore` "0–100; null = not enough data"
    - `summary` "one line, ≤ 140 chars"
    - JSON columns `analysedCoverage` and `limitations`
    - `accompanimentKind` enum `none` | `loop` | `backing` | `click`
    - `loopLengthMs`, `timingReference` enum `own_playing` | `accompaniment`
    - `separationConfidence` enum `good` | `partial` | `poor` (nullable)
    - `liveOnsetMatchRate`, `targetTempoDeltaBpm`, `processingMs`
  - **`feedback_point`**: all fields in data-model.md § FeedbackPoint, with cascade delete from the report:
    - `category` enum `timing` | `technique`
    - `aspect` enum `tempo` | `rhythm` | `fretting_hand` | `picking_hand` | `clarity` | `posture`
    - `severity` enum `info` | `minor` | `moderate` | `major`
    - `confidence` "0–1"
    - JSON `metrics`, `sortOrder`
  - **Indexes**: all four from data-model.md § Indexes, plus `feedback_report(accompanimentKind)`
- [X] T012 Add `drizzle.config.ts` (dialect `sqlite`, driver `expo`). Generate the initial migration into `src/data/db/migrations/`. Create `src/data/db/client.ts`, which opens `rifflect.db` via `expo-sqlite` with `PRAGMA foreign_keys = ON` and exports `db` and a `useDbMigrations()` hook (drizzle `useMigrations`)
- [X] T013 [P] Create the Node test DB helper `tests/helpers/testDb.ts`. It builds an in-memory `better-sqlite3` database with drizzle (`drizzle-orm/better-sqlite3`), applies the migrations from `src/data/db/migrations/`, and returns a fresh `db` per test
- [X] T014 [P] Create `src/lib/ids.ts` (`newId()` returns a UUID v7) and `src/lib/time.ts` (`nowIso()`, `localDayKey(iso)`, `isoWeekKey(iso)`). Add unit tests in `tests/unit/lib/time.test.ts`
- [X] T015 [P] Create the take file store `src/data/files/takeFiles.ts` on top of `expo-file-system`, with the layout from [data-model.md § File layout](./data-model.md#file-layout):
  - `takeDir(id)` = `<documents>/takes/<id>/`, plus `videoPath`, `landmarksPath`, `thumbPath`
  - `pcmCachePath(id)` = `<cache>/analysis/<id>.f32`
  - `ensureTakeDir`, `deleteTakeDir`, `takeDirSizeBytes`, `freeDiskBytes`

  File paths are stored relative to the documents directory.

### Native modules (see [contracts/native-modules.md](./contracts/native-modules.md))

- [X] T016 Scaffold the local Expo module `modules/rifflect-audio-decoder` (`npx create-expo-module@latest --local`). Define its TS interface in `modules/rifflect-audio-decoder/src/index.ts`, exactly as in the contract (`decodeAudioTrack`, `readPcmChunk`, error codes `E_NO_AUDIO_TRACK`, `E_DECODE_FAILED`, `E_FILE_NOT_FOUND`). Add the typed wrapper `src/native/audioDecoder.ts` and a Jest mock `src/native/__mocks__/audioDecoder.ts`
- [ ] T017 [P] Scaffold the local **Nitro** module `modules/rifflect-hand-landmarker` (a Nitro module set up for `nitrogen` code generation, autolinked as a local package). Define the `HandLandmarker` and `LandmarkWriter` hybrid object specs in `modules/rifflect-hand-landmarker/src/specs/*.nitro.ts` exactly as in the [VisionCamera 5 contract](./contracts/native-modules.md#1-rifflect-hand-landmarker-nitro-module-handlandmarker-hybrid-object), with `detect(frame: Frame)` using VisionCamera's `Frame` type, plus `createHandLandmarker`, `openLandmarkWriter` and `extractLandmarksFromVideo`. Add the wrapper `src/native/handLandmarker.ts` and a Jest mock in `src/native/__mocks__/handLandmarker.ts`
- [ ] T018 (device) Implement the Android audio decoder in `modules/rifflect-audio-decoder/android/src/main/java/expo/modules/rifflectaudiodecoder/RifflectAudioDecoderModule.kt`:
  - **Decode**: `MediaExtractor` selects the audio track, then `MediaCodec` decodes to PCM.
  - **Convert**: downmix to mono and resample to 22,050 Hz Float32.
  - **Output**: write a little-endian `.f32` file to the given cache path and return `{ pcmPath, sampleRate, frames, durationMs, peak }`.
  - **Partial files**: return `E_DECODE_FAILED` for unreadable partial files (e.g. left by a crash) rather than crashing.
  - **`readPcmChunk`**: return an `ArrayBuffer`-backed `Float32Array`.
- [ ] T019 (device) Implement the Android `HandLandmarker` hybrid object in `modules/rifflect-hand-landmarker/android/src/main/java/com/margelo/nitro/rifflect/handlandmarker/HybridHandLandmarker.kt`:
  - **Dependency**: add `com.google.mediapipe:tasks-vision` to `modules/rifflect-hand-landmarker/android/build.gradle`.
  - **Model**: load `hand_landmarker.task` from app assets with `RunningMode.VIDEO`, `numHands = 2`, `minHandDetectionConfidence = 0.5`.
  - **Per frame**: in the Kotlin `HybridHandLandmarker.detect(frame)`, take the frame's native buffer, wrap it as an `MPImage` (respecting `frame.orientation`), call `detectForVideo(image, frame.timestamp ms)`, and return `{ tMs, hands:[{ side, score, pts:[[x,y,z]×21] }], brightness }`, where `brightness` is the mean of the Y plane / 255.
  - **Budget**: per-call work must stay under 40 ms.
- [ ] T020 (device) Implement the native landmark writer (`openLandmarkWriter(takeId)`, `append`, `close`) for Android in `modules/rifflect-hand-landmarker/android/src/main/java/com/margelo/nitro/rifflect/handlandmarker/LandmarkWriter.kt`.
  - **Format**: append JSON Lines `{ "t": tMs, "hands": [{ "side", "score", "pts" }] }` to `takes/<takeId>/landmarks.jsonl`.
  - **Flushing**: buffer and flush at least every 1 s, so a crash loses at most 1 s of frames.
- [ ] T021 (device) Implement `extractLandmarksFromVideo(videoPath, fps)` for Android in `modules/rifflect-hand-landmarker/android/src/main/java/com/margelo/nitro/rifflect/handlandmarker/LandmarkExtractor.kt`. It is the fallback when the live stream is missing:
  - **Decode frames**: `MediaMetadataRetriever.getFrameAtTime` / `MediaCodec`.
  - **Detect**: run `detectForVideo` at `fps`.
  - **Output**: write `landmarks.jsonl` and return its path.
- [X] T022 [P] Create the parser `src/native/landmarksFile.ts`. It reads `landmarks.jsonl` (streaming line by line), converts it to the engine type `LandmarkFrame[]` (`tMs`, `hands[].side|score|pts`), and skips malformed or truncated last lines. Tests go in `tests/unit/native/landmarksFile.test.ts`
- [X] T023 Create the PCM reader `src/native/pcm.ts`. It loads a decoded `.f32` file into a single `Float32Array` by calling `readPcmChunk` in chunks of 1,048,576 frames, and reports progress
- [ ] T024 [P] Write the landmark extraction script `tools/eval/extract_landmarks.py` (Python, `mediapipe` Tasks API, the same `assets/models/hand_landmarker.task`, VIDEO mode, 12 fps). It writes `landmarks.jsonl` in the [data-model.md](./data-model.md#file-layout) format and pins its dependencies in `tools/eval/requirements.txt`. Used to produce the fixture landmarks in T041 and T093, and the evaluation corpus landmarks

### Device spikes (decision gates; see [plan.md § Phase ordering](./plan.md#phase-ordering--key-risks-input-for-speckit-tasks))

- [ ] T025 (human, device) **Spike A: live landmarks.** Build a dev-only screen `app/dev/spike-landmarks.tsx` that previews and records 1080p30 video (video output with audio) while a frame output (YUV, ~640×480) calls `HandLandmarker.detect` from its worklet, throttled to 12 fps. Run it for 60 s, and once for 5 minutes, on the Nothing Phone (4a) using a **release** build (debug builds give misleading timings). Log dropped recording frames, mean and p95 `detect` time, and thermal warnings (`PowerManager.getCurrentThermalStatus`).
  - **Results**: record them in `specs/001-guitar-practice-feedback/spikes.md`.
  - **Gate**: pass = no dropped recording frames and p95 under 40 ms. Fail = switch US1 to post-take extraction (T021) as the primary path, and update [research.md R3](./research.md).
  - **Crash check**: force-kill the app 20 s into a recording (`adb shell am force-stop com.rifflect.app`). Record whether the leftover file can be decoded (T018) and played. If it can, recovery stays as specified. If not, recovery (T077) deletes unreadable partial takes with a message.
- [ ] T026 (human, device) **Spike B: clock alignment.** On the same screen, record 10 sharp hand claps with both hands in view. Compare each clap's audio onset time (from the decoded PCM) with the frame where the landmarks show the hands closest together. The tolerance is ±20 ms.
  - **Results**: record the mean and spread of the offset in `specs/001-guitar-practice-feedback/spikes.md`.
  - **Gate**: if the offset is constant but non-zero, store it in `src/capture/clockOffset.ts` (keyed by platform, so iOS can add its own value later) and apply it when parsing landmarks (T022).

### Analysis core (shared by all stories; see [contracts/analysis-engine.md](./contracts/analysis-engine.md))

- [X] T027 [P] Create the engine's public types in `src/analysis/types.ts`, exactly as in the contract:
  - `AnalysisInput` (including `targetTempoBpm?` "30..300" and `accompaniment: 'auto' | 'on' | 'off'`), `LandmarkFrame`, `AnalysisResult` (including the `accompaniment` block), `FeedbackPointOut`, `AnalysisOptions` (`onProgress`, `signal`)
  - The `IssueCode` union with every code in the contract's Issue codes table
  - The `LimitationCode` union with every code in the contract's Limitation codes list
- [X] T028 [P] Create the versioned thresholds in `src/analysis/config/thresholds.ts`. Include `ENGINE_VERSION = '1.0.0+t1'` and `CONFIDENCE_FLOOR = 0.6`, plus every numeric threshold named in [research.md](./research.md) R6, R7, R9 and R16 and in the contract:
  - **Timing**: rushing/dragging ±25 ms; tempo drift 3 BPM; off-target tempo 5%; tempo search range 60–220 BPM
  - **Technique**: wrist strain 5 s; live-clarity confidence 0.7
  - **Accompaniment**: ahead/behind ±20 ms; lost place ≥ ¼ beat; onset↔stroke match ±50 ms; click match ±15 ms
  - **Scoring**: the constants in R9
  - **No playing**: below 10% onset-active frames

  Every value lives here; no magic numbers elsewhere.
- [X] T029 [P] Create synthetic test signal helpers in `tests/helpers/synth.ts`, all at 22,050 Hz mono `Float32Array`:
  - A plucked-string generator (Karplus-Strong)
  - Onset trains at given times and BPM, with jitter or a constant offset
  - Tempo drift
  - White and pink noise at a given SNR
  - A buzz burst (broadband, high frequency, right after an onset)
  - A muted note (fast decay)
  - A speech-like noise signal with no pitched onsets
- [X] T030 [P] Create synthetic landmark helpers in `tests/helpers/synthLandmarks.ts`:
  - **Hands**: fretting and picking hands with 21 points, with controllable thumb position, PIP-joint curvature, fingertip lift and wrist angle
  - **Strumming**: picking-hand strokes at given times
  - **Edge cases**: missing hands for given ranges, and front-camera mirroring

  Output is `LandmarkFrame[]`.
- [X] T031 Write DSP tests in `tests/unit/analysis/dsp.test.ts`:
  - FFT matches a naive DFT within 1e-4 for sizes 256, 1024 and 2048
  - STFT frame count for a given length, window 1024 and hop 256
  - Spectral flux peaks within ±1 hop of synthetic onsets
  - Autocorrelation peaks at the known period
- [X] T032 Implement the DSP behind a `Dsp` interface in `src/analysis/dsp/` (`index.ts` exports the interface and the default TS implementation):
  - `fft.ts`: in-place radix-2 real FFT
  - `stft.ts`: Hann window, log-magnitude, band limiting
  - `flux.ts`: spectral flux and adaptive peak picking
  - `autocorr.ts`
  - `chroma.ts`: 12-bin chroma from the STFT, used by US4

  T031 must pass.

### Job queue & app shell

- [X] T033 Write job queue tests in `tests/unit/jobs/analysisQueue.test.ts` using `tests/helpers/testDb.ts` and an injected fake runner:
  - Jobs run one at a time, in FIFO order
  - Status moves `pending → analysing → analysed | failed | no_playing`
  - `failed` can be retried
  - `loadPending()` enqueues every take with `analysisStatus = 'pending'` in `recordedAt` order; it never changes statuses (start-up status repair belongs to `src/jobs/recovery.ts`, T077)
  - Progress events are emitted per take
- [X] T034 Implement the analysis job queue in `src/jobs/analysisQueue.ts`: a singleton with `enqueue(takeId)`, `retry(takeId)`, `loadPending()` and progress subscription per `takeId` (zustand store `src/jobs/analysisProgressStore.ts`). The runner function is injected so it can be replaced in tests. Analysis keeps running while the user navigates the app. T033 must pass
- [X] T035 Create the app shell:
  - **Root layout** `app/_layout.tsx`: runs `useDbMigrations()`, shows a splash or error state until migrations finish, calls `analysisQueue.loadPending()` (T077 later inserts `runRecovery()` before it), and redirects to `/onboarding` when no `player_profile` row exists (redirect logic in `src/features/onboarding/useProfileGate.ts`).
  - **Tabs**: `app/(tabs)/_layout.tsx` with the tabs Record, Library, Progress and Settings, each a placeholder screen file.
  - **Theme**: tokens in `src/ui/theme.ts`, with light and dark modes and accessible contrast.

**Checkpoint**: migrations apply on a device. Both native modules build in an Android development build and in the release APK. Spike gates are recorded in `spikes.md`. DSP and queue tests pass. User-story work can start.

---

## Phase 3: User Story 1 - Record a practice take and get feedback (Priority: P1) 🎯 MVP

**Goal**: A user records a take with the camera and microphone. Once it finishes, they get on-device written feedback on timing and technique, with scores. Each point is tied to a moment in the video.

**Independent Test**: Record one 30–60 s take. The app shows at least one timing point and at least one technique point. Tapping a point seeks the video. With a target tempo, the feedback states the tempo played and how far it was from the target. Talking only gives "no playing". This works in airplane mode ([quickstart V1, V2](./quickstart.md)).

### Tests for User Story 1 ⚠️ (write first and confirm they fail)

- [X] T036 [P] [US1] Write timing engine tests in `tests/analysis/timing.test.ts` using `tests/helpers/synth.ts`:
  - Onsets are detected within ±10 ms, with recall ≥ 95% at SNR 20 dB
  - Tempo is estimated within ±1 BPM for 60, 90, 120, 160 and 200 BPM
  - A target tempo resolves the half/double ambiguity (e.g. a 70 BPM target on a 140 BPM eighth-note pattern gives 70)
  - A constant −40 ms offset on beat 4 emits `timing.rushing` with `metrics.beat = 4`; +40 ms emits `timing.dragging`
  - A 6 BPM linear increase emits `timing.tempo_drift_up`
  - Played 86 vs target 80 emits `timing.off_target_tempo` with `targetDeltaBpm ≈ 6`
  - A steady, accurate input emits `timing.steady`
- [X] T037 [P] [US1] Write technique engine tests in `tests/analysis/technique.test.ts` using `tests/helpers/synthLandmarks.ts` and `synth.ts`:
  - Each landmark rule emits its code: `technique.fret_thumb_over_neck`, `technique.flat_fingers`, `technique.fingers_lifting_high`, `technique.wrist_strain` (held > 5 s only), `technique.inconsistent_strum` and `technique.stopped_strum_motion`
  - Buzz and muted synthetic notes emit `technique.fret_buzz` and `technique.muted_notes`
  - A clean signal emits `technique.clean`
  - With `handedness = 'left'` and mirrored front-camera input, fretting and picking roles are assigned correctly (contract guarantee 5)
  - Missing hands for 50% of the take give `coverage.frettingHand ≈ 0.5` and a `hands_not_visible` limitation with the correct `fromMs` and `toMs`
- [X] T038 [P] [US1] Write engine contract tests in `tests/analysis/contract.test.ts` for guarantees 1–7 in [contracts/analysis-engine.md](./contracts/analysis-engine.md#guarantees-tested):
  - A speech-like or silent input gives `status = 'no_playing'`, `points = []` and null scores
  - An analysed result has ≥ 1 timing and ≥ 1 technique point, or a limitation plus a null score for that category
  - Every `startMs` is in `[0, durationMs]`
  - The same input always gives the same output (deep equal)
  - Text depends only on `issueCode`, metrics and `skillLevel` (beginner and advanced wording differ for the same finding)
  - No point has `confidence` < 0.6
  - `summary.length` ≤ 140
- [X] T039 [P] [US1] Write the fixture-suite runner in `tests/analysis/fixtures.test.ts`:
  - **Discovery**: finds each `tests/fixtures/<name>/` with `audio.wav` (mono, any sample rate, resampled to 22,050 in the test helper `tests/helpers/wav.ts`), an optional `landmarks.jsonl`, `input.json` (player, cameraPosition, targetTempoBpm, accompaniment) and `expected.json`.
  - **`expected.json`**: `mustInclude` issue codes, `mustNotInclude` codes, an optional score range, and an expected status.
  - **Check**: asserts each expectation.
  - **Empty folder**: the suite passes with zero fixtures.
- [X] T040 [P] [US1] Write repository tests in `tests/unit/data/takesReportsRepo.test.ts`:
  - **Take creation**: copies `handednessAtRecording` and `skillLevelAtRecording` from the profile.
  - **Save validation**: "`saved = true` requires `captureStatus = complete` or `interrupted = true`".
  - **Report persistence**:
    - `saveReport(takeId, AnalysisResult)` writes the report and points.
    - It replaces any existing report for that take.
    - It rejects a point with `startMs` outside "`[0, take.durationMs]`".
  - **Cascade**: deleting a report cascades to its points.
- [ ] T041 [US1] (human) Record at least 6 real fixture clips (30–60 s, phone on a stand, front camera) and add them as `tests/fixtures/<name>/` with `audio.wav`, `landmarks.jsonl` (from `tools/eval/extract_landmarks.py`, T024), `input.json` and `expected.json`:
  - `steady-strum-80`
  - `rushing-beat4-80`
  - `dragging-90`
  - `buzzing-f-barre`
  - `muted-notes`
  - `talking-only`

  Clips must not contain faces or speech that identifies a person; crop or blur if needed.

### Implementation for User Story 1: analysis engine

- [X] T042 [US1] Implement onset detection in `src/analysis/timing/onsets.ts`:
  - **Method**: log-magnitude STFT, window 1024, hop 256, band-limited to 80 Hz–1.5 kHz; spectral flux; adaptive median-threshold peak picking.
  - **Output**: onset times in ms, onset strength envelope, and fraction of onset-active frames.
- [X] T043 [US1] Implement tempo estimation and beat tracking in `src/analysis/timing/beatGrid.ts`:
  - **Tempo**: autocorrelation of the onset-strength envelope over 60–220 BPM. An optional `targetTempoBpm` biases half/double resolution.
  - **Grid**: dynamic-programming beat tracker producing a beat grid with local tempo.
  - **Output**: `{ beatTimesMs, bpm, localBpm[] }`, or null if no stable tempo (which raises `tempo_not_detected`).
- [X] T044 [US1] Implement timing metrics and findings in `src/analysis/timing/metrics.ts` and `src/analysis/timing/findings.ts`:
  - **Subdivision**: pick the best subdivision (beat, eighth or sixteenth note).
  - **Offsets**: signed offset per onset, mean absolute offset, offset per beat position, within-beat variance, and drift (max − min of local tempo).
  - **Findings**: emit `timing.steady`, `timing.rushing` (< −25 ms), `timing.dragging` (> +25 ms), `timing.uneven_subdivision`, `timing.tempo_drift_up` / `timing.tempo_drift_down` (> 3 BPM) and `timing.off_target_tempo` (> 5%). Each has `startMs`, `endMs`, metrics, severity and confidence.

  T036 must pass.
- [X] T045 [P] [US1] Implement hand-role assignment in `src/analysis/technique/hands.ts`:
  - **Labels**: correct mirrored MediaPipe `side` labels for the front camera.
  - **Roles**: map handedness to roles (right-handed: fretting = left hand).
  - **Smoothing**: exponential smoothing of points.
  - **Coverage**: per-role coverage, and ranges where a hand is missing or the fretting hand is out of frame.

  Also export the stroke detector `detectStrokes(pickingHandFrames)` (wrist velocity peak followed by direction reversal), which US4 reuses.
- [X] T046 [US1] Implement the fretting-hand analyser in `src/analysis/technique/frettingHand.ts`: `technique.fret_thumb_over_neck` (severity `info` when chord-like stable shapes dominate), `technique.flat_fingers`, `technique.fingers_lifting_high` and `technique.wrist_strain` (extreme flexion held > 5 s), each with a confidence based on visibility
- [X] T047 [US1] Implement the picking-hand analyser in `src/analysis/technique/pickingHand.ts`: `technique.inconsistent_strum` (variance of stroke amplitude and timing) and `technique.stopped_strum_motion` (pauses in an otherwise periodic stroke pattern), using `detectStrokes` from T045 and the onsets
- [X] T048 [P] [US1] Implement the clarity analyser in `src/analysis/technique/clarity.ts`, emitting `technique.fret_buzz`, `technique.muted_notes`, `technique.unwanted_open_strings` and `technique.clean`:
  - **Inputs**: a signal, an onset list and an optional per-onset "live confidence" (so US4 can pass the separated live residual and suppress uncertain onsets).
  - **Signals**: broadband high-frequency energy plus inharmonicity just after the onset; decay rate; persistent low open-string partials.
- [X] T049 [P] [US1] Implement the posture checks and limitation builder:
  - **`src/analysis/technique/posture.ts`**: sustained extreme wrist angles, and the frame being cut off. Otherwise emit `posture_not_assessed`.
  - **`src/analysis/limitations.ts`**: build `limitations` entries for `hands_not_visible`, `fretting_hand_out_of_frame`, `low_light` (brightness from landmarks), `noisy_audio` (SNR estimate), `clipping_audio` (peak ≥ 0.99), `landmarks_missing`, `tempo_not_detected` and `take_interrupted`, each with a user-facing message.
- [X] T050 [P] [US1] Implement scoring in `src/analysis/scoring/scores.ts`, using the formulas in [research.md R9](./research.md#r9-scores-fr-010):
  - **Timing**: `100 × clamp(1 − (meanAbsOffsetMs − 10)/90, 0, 1)` minus up to 15 points for drift over 3 BPM.
  - **Technique**: 100 minus the severity-weighted findings per minute, floored at 0, computed only from assessed aspects.
  - **Not enough data**: return `null` when coverage is too low.
- [X] T051 [P] [US1] Implement the feedback text catalogue in `src/analysis/feedback-text/catalogue.ts` and `src/analysis/feedback-text/render.ts`:
  - **Templates**: for every `IssueCode`, an observation template and a suggestion template for each of `beginner`, `intermediate` and `advanced`, with `{placeholders}` filled from metrics. Times are formatted like "around 0:42", bars like "bars 3–6", and ms values rounded to 5.
  - **Summary**: `buildSummary(points, skill)` writes a summary of at most 140 chars from the top 1–3 points.
  - **Recurring text**: `recurringText(code, n, of)` for US3, e.g. "Rushing on beat 4 in 6 of your last 8 takes".
- [X] T052 [US1] Implement the orchestrator `analyseTake` in `src/analysis/index.ts`:
  1. Run DSP and onsets.
  2. If onset-active frames are below 10%, return `no_playing`.
  3. Otherwise run the beat grid, timing findings, hand roles, technique analysers and limitations.
  4. Drop findings below the confidence floor of 0.6.
  5. Ensure each category has ≥ 1 point or a limitation plus a null score.
  6. Score, render text, and sort points by severity, then time.

  The orchestrator reports progress through `onProgress` at each stage and honours `signal.aborted`. Leave a clearly marked hook for the accompaniment stage: when `input.accompaniment === 'off'`, US1 behaves as solo; US4 fills the hook in. T037, T038 and T039 must pass.

### Implementation for User Story 1: capture, persistence & UI

- [X] T053 [P] [US1] Implement the profile repository in `src/data/repositories/profileRepo.ts`: `getProfile()` and `upsertProfile({ handedness, skillLevel, preferredCamera, lastAccompanimentSetting })` with `id = 'me'`, validated against the schema enums
- [X] T054 [US1] Implement the takes and reports repositories in `src/data/repositories/takesRepo.ts` and `src/data/repositories/reportsRepo.ts`:
  - **Takes**: `createTake(...)` (`captureStatus = 'recording'`, `analysisStatus = 'pending'`, `saved = false`, copies of profile handedness and skill), `completeCapture(id, durationMs, fileSizeBytes, landmarksPath | null)` (sets `too_short` when "`durationMs < 5,000`"), `markInterrupted(id)`, `setAnalysisStatus(id, status)` and `getTake(id)`
  - **Reports**: `saveReport(takeId, result: AnalysisResult, processingMs)`, which maps `AnalysisResult` to rows and replaces any existing report, and `getReportWithPoints(takeId)`

  T040 must pass.
- [X] T055 [US1] Build the onboarding route `app/onboarding.tsx` with steps in `src/features/onboarding/`:
  - **Steps**: Welcome → permissions explainer (requests camera and microphone via VisionCamera) → handedness (`onboarding-handedness-left` / `onboarding-handedness-right`) → skill level (`onboarding-skill-beginner|intermediate|advanced`) → save the profile → `/(tabs)/record`
  - **Permission denied**: show an explanation and an "Open Settings" button (`permission-open-settings`) via `Linking.openSettings()`; never attempt to record
- [X] T056 [P] [US1] Implement the camera session helper in `src/capture/cameraSession.ts`. It picks the front or back device from the profile, a 1080p30 format with audio, and the frame-processor fps cap. It exposes a hook `useCameraSession()` for the Record screen
- [X] T057 [US1] Implement the framing check in `src/capture/framingCheck.ts`:
  - **Inputs**: a pure function over the last 30 `HandsResult` frames.
  - **Statuses**:
    - `ok` when both hands are detected in ≥ 80% of frames, the fretting hand's landmarks are all inside [0.02, 0.98], and brightness is ≥ the threshold.
    - `hands_missing`, `fretting_out_of_frame` or `low_light` otherwise.
  - **Hint**: a repositioning hint string for each status.
  - **Wiring**: moved to T059, where the camera and frame output are set up. This task delivers the pure check plus a `FramingWindow` ring buffer.

  Tests go in `tests/unit/capture/framingCheck.test.ts`.
- [X] T058 [US1] Implement the recording controller in `src/capture/recordingController.ts`:
  - **`start(opts)`**:
    - Check free space (≥ 600 MB, or the estimated size of a 5-minute take, else block with the storage warning).
    - Create the take row (T054) and its folder (T015).
    - Open the landmark writer.
    - Start recording on the VisionCamera 5 video output (`enableAudio: true`) through its `Recorder`, writing to the take folder.
    - Run `HandLandmarker.detect` in the frame-output worklet at a fixed 12 fps (`LANDMARK_FPS` in `src/capture/config.ts`; no device tiering in v1) and append each result.
    - Auto-stop at 300,000 ms.
  - **`stop()`**: finalise the video, close the writer, call `completeCapture`, and enqueue analysis unless the take is `too_short`.
  - **Interruption**: `AppState` changes to background or recording errors stop the recording and call `markInterrupted`.
- [ ] T059 [US1] (built except the framing wiring, which waits for the hand landmarker T017–T020) Build the Record screen in `app/(tabs)/record.tsx` with components in `src/features/record/`:
  - **Framing wiring** (from T057): `useFramingStatus()` in `src/capture/useFramingStatus.ts` feeds frame-output hand results into a `FramingWindow` (worklet → JS thread with `scheduleOnRN` / `runOnJS` from `react-native-worklets`, whichever the installed version provides), throttled to a few UI updates per second.
  - **Camera and framing**: camera preview, plus a framing checklist (`framing-status` showing the status and hint).
  - **Tempo**: optional target tempo (`tempo-input`, an integer that rejects values outside "30–300", empty = none).
  - **Recording**: `record-button` with an elapsed timer and the 5:00 maximum, and `storage-warning` when free space is low.
  - **After stopping**: navigate to `/take/[id]/analysing`.
  - **Storage** (from T072): block recording with `storage-warning` when `storageStatus().cannotRecord`, and warn when `low`.
- [X] T060 [US1] Implement the analysis runner in `src/jobs/runAnalysis.ts`, injected into the queue (T034):
  1. Load the take and profile snapshot.
  2. Call `decodeAudioTrack(video, { sampleRate: 22050, mono: true })` and read the PCM (T023).
  3. Parse landmarks (T022). If `landmarksPath` is null, call `extractLandmarksFromVideo(video, 12)` first.
  4. Run `analyseTake` on the JS thread as a yielding async pipeline ([research R5](./research.md#r5-where-the-analysis-code-runs-typescript-core-vs-c)), forwarding progress and cancellation.
  5. Call `saveReport` with `processingMs`.
  6. Set the status to `analysed` or `no_playing`.
  7. Delete the PCM cache.

  Any native error code sets `failed`.
- [X] T061 [US1] Build the analysing screen `app/take/[id]/analysing.tsx`. It shows progress from the progress store (`analysis-progress`) and a "Leave – we'll let you know when it's ready" action (`analysis-leave`), which records the take ID in the progress store's `leftTakeIds`. On completion it does `router.replace('/take/[id]')`. On `failed` it shows a Retry button that calls `analysisQueue.retry`
- [X] T062 [US1] Build the analysis-done notice in `src/features/feedback/AnalysisDoneToast.tsx`, mounted in `app/_layout.tsx`. It subscribes to the progress store and, when a take in `leftTakeIds` finishes (`analysed`, `no_playing` or `failed`), shows `analysis-done-toast` ("Feedback ready – View") on whatever screen is open. Tapping it opens `/take/[id]` and removes the ID from `leftTakeIds`
- [X] T063 [US1] Build the feedback screen `app/take/[id]/index.tsx` with components in `src/features/feedback/`:
  - **Player**: `expo-video` with a seek API.
  - **Scores**: `score-timing` and `score-technique` (show "Not enough data" when null), plus the summary.
  - **Points**: the list of `feedback-point-<i>` items (category icon, observation, suggestion, time). Tapping one seeks to `startMs` and plays.
  - **Limitations**: a `limitations` section.
  - **Special states**: dedicated states for `no_playing` ("We couldn't find playing to analyse") and `too_short` ("Takes need to be at least 5 seconds").
- [X] T064 [P] [US1] Write a component test in `tests/components/feedbackScreen.test.tsx`: a mocked report renders scores, points and limitations; tapping `feedback-point-0` calls the player's seek with `startMs`; null scores render "Not enough data"; the `no_playing` state hides the points list
- [X] T065 [US1] Build a minimal Settings screen `app/(tabs)/settings.tsx` with components in `src/features/settings/`: handedness (`settings-handedness`), skill level (`settings-skill`) and preferred camera, persisted via `profileRepo` (FR-005)
- [ ] T066 [US1] Write the Maestro smoke flow `e2e/v1-first-take.yaml` (onboarding → Record → record 10 s → wait for feedback → assert `score-timing` visible → tap `feedback-point-0`), runnable against the installed app on the phone. Optionally also `e2e/v2-too-short.yaml` (record 3 s → assert the minimum-length message)

**Checkpoint**: US1 is fully functional on its own. Quickstart V1 and V2 pass on the Nothing Phone (4a) with an installed release build, including in airplane mode. This is the MVP.

---

## Phase 4: User Story 2 - Save and revisit takes on the phone (Priority: P2)

**Goal**: Users save or discard takes, browse a library newest first, search by label, rename or relabel, delete, export or share, see storage used, and recover interrupted takes.

**Independent Test**: Save several labelled takes, discard one, force-quit and reopen in airplane mode. The saved takes, with their video and feedback, are listed newest first and play. Deleting one frees storage ([quickstart V3, V5](./quickstart.md)).

### Tests for User Story 2 ⚠️

- [X] T067 [P] [US2] Write practice item and library repository tests in `tests/unit/data/libraryRepo.test.ts`:
  - **Item names**: "1–60 chars, trimmed, unique ignoring case" (creating "G–C–D" after "g–c–d" returns the existing item).
  - **Deleting an item**: sets its takes' `practiceItemId` to null, and they show as "Unlabelled".
  - **Library list**: only `saved = true` takes, ordered by `recordedAt DESC`, with label, duration and summary joined.
  - **Search**: by label (case-insensitive substring).
  - **Titles**: "≤ 80 chars".
  - **Drafts**: `listDrafts()` returns only `saved = false` takes that are not interrupted, newest first, each with its removal time (`createdAt` + 24 h).
  - **`lastUsedAt`**: set when a take is saved with that item.
- [X] T068 [P] [US2] Write recovery and cleanup tests in `tests/unit/jobs/recovery.test.ts`:
  - On start, `captureStatus = 'recording'` becomes `partial` with `interrupted = true`
  - `analysing` becomes `pending` and is re-queued
  - Drafts with `interrupted = true` are listed for `/recover`
  - "Any other draft older than 24 h is deleted" (row and folder)
  - A saved take is never touched

### Implementation for User Story 2

- [X] T069 [P] [US2] Implement the practice items repository in `src/data/repositories/practiceItemsRepo.ts`: `listItems()` (by `lastUsedAt DESC`), `findOrCreate(name)` (trim, validate "1–60 chars", case-insensitive match), `rename` and `delete`
- [X] T070 [US2] Extend `src/data/repositories/takesRepo.ts`:
  - **`saveTake(id, { practiceItemId?, title? })`**: enforces the save rule, sets `saved = true`, updates the item's `lastUsedAt`, and generates `thumb.jpg` via `expo-video-thumbnails` at 1 s.
  - **`discardDraft(id)`**: deletes the row and the folder; nothing is stored.
  - **`deleteTake(id)`**: deletes the row (cascading to the report and points) and the folder.
  - **`listLibrary({ search? })`**, **`updateTitle`**, **`setPracticeItem`**.

  T067 must pass.
- [X] T071 [US2] Add Save, Discard and Label to the feedback screen in `src/features/feedback/TakeActions.tsx`:
  - **Controls**: `save-take`, `discard-take` (confirm), and `label-picker` (pick an existing item or type a new one).
  - **Leaving a draft**: intercept leaving `/take/[id]` while the take is unsaved and prompt Save / Discard / Keep for now (expo-router `usePreventRemove`).
- [X] T072 [US2] Implement storage accounting in `src/data/files/storage.ts`:
  - **Usage**: `totalTakesBytes()` sums `take.fileSizeBytes`.
  - **Space check**: `hasSpaceFor(bytes)` uses `freeDiskBytes()`.
  - **Low-space threshold**: `LOW_SPACE_BYTES` = 600 MB.
  - **Wiring**: warn when saving (done, via `saveTakeWithLabel`) and show usage in the Library and Settings. The Record-screen `storage-warning` before recording is part of T059.
- [X] T073 [US2] Build the Library screen `app/(tabs)/library.tsx` with components in `src/features/library/`:
  - **List**: drizzle live query (`useLiveQuery`) of `listLibrary`, items `library-item-<id>` showing the thumbnail, date, duration, label or "Unlabelled", the first line of the summary, and both scores.
  - **Search**: `library-search`.
  - **Storage**: a `storage-used` footer.
  - **Empty state**: shown when there are no saved takes.
  - **Navigation**: tapping an item opens `/take/[id]`.
- [X] T074 [US2] Build the "Not saved yet" section in `src/features/library/UnsavedSection.tsx`, shown above the saved list on the Library screen (`library-unsaved`). Add `listDrafts()` to `src/data/repositories/takesRepo.ts`. Each item `unsaved-item-<id>` shows the date, duration, analysis status and "Removed in Xh", with open, save and discard actions (save opens the label picker from T071). The section is hidden when there are no drafts (FR-015, Story 2 scenario 5)
- [X] T075 [US2] Build the edit screen `app/take/[id]/edit.tsx`:
  - **Edit**: rename (title "≤ 80 chars") and relabel.
  - **Delete**: `delete-take`, then `confirm-delete`, then return to the library.
  - **Export**: `export-to-photos` via `expo-media-library` (SDK 58 API: `requestPermissionsAsync(true)` for add-only access, then `Asset.create(videoUri)`; the old `saveToLibraryAsync` now throws).
  - **Share**: `share-take` via `expo-sharing`.
- [X] T076 [US2] Implement "Export all" (FR-031) in `src/data/files/exportAll.ts`, with the Settings action `export-all` in `src/features/settings/ExportAll.tsx`:
  - **Folder**: ask for a destination folder with `Directory.pickDirectoryAsync()` (expo-file-system SDK 58 object API, Android folder picker), then create `rifflect-export-<YYYY-MM-DD-HHmm>/`. Videos are copied in 1 MB chunks through file handles.
  - **Contents**: the layout in [data-model.md § "Export all" backup layout](./data-model.md#export-all-backup-layout-fr-031): `takes.json` with every saved take (fields as listed there), and per take a `<YYYY-MM-DD_HHmm>_<label-or-untitled>/` folder (sanitise names to letters, digits, `-` and `_`) containing `video.mp4` and `feedback.txt` (scores, summary, then each point as `[m:ss] observation — suggestion`).
  - **Scope**: saved takes only; unsaved drafts, landmark files and thumbnails are excluded.
  - **Behaviour**: copy files one at a time with a progress indicator ("12 of 40"); stop cleanly and report which takes were exported if space runs out or the folder becomes unavailable; never modify or delete anything in the app's own storage.
  - **Tests**: `tests/unit/data/exportAll.test.ts` with the file system mocked: correct `takes.json` contents, folder naming and sanitising, drafts excluded, partial-failure reporting.
- [X] T077 [US2] Implement start-up recovery in `src/jobs/recovery.ts` (exports `runRecovery()`, the single owner of start-up status repair; called from `app/_layout.tsx` after migrations, before `analysisQueue.loadPending()`), and the `/recover` route `app/recover.tsx`. The route lists the interrupted drafts with `recover-analyse-<id>` (enqueue analysis; partial video accepted, which raises a `take_interrupted` limitation) and `recover-discard-<id>`. If an interrupted take's video can't be decoded (the decoder returns `E_DECODE_FAILED` or `E_NO_AUDIO_TRACK`, e.g. after a crash or power loss), `runRecovery()` deletes the take and folder, and `/recover` shows `recover-lost-notice` ("A recording was lost because the app closed unexpectedly"). Add a case for this to T068. T068 must pass
- [ ] T078 [US2] (optional) Write the Maestro flows `e2e/v3-library.yaml` (record → save with a label → second take discarded → library shows one item → delete with confirm → empty state) and `e2e/v5-interruptions.yaml` (start recording → background the app → relaunch → `/recover` shows the take)

**Checkpoint**: US1 and US2 both work. Quickstart V3 and V5 pass. Saved takes survive restarts, airplane mode and installing an updated release APK (SC-007). "Export all" produces a complete backup folder.

---

## Phase 5: User Story 4 - Get feedback while playing over a loop or backing track (Priority: P2)

**Goal**: Detect loops, backing tracks and clicks. Use the accompaniment's beat as the timing reference, separate the live playing (REPET plus picking-hand attribution), and give feedback only on the live part, with a separation confidence. The user can re-analyse a take as solo or accompanied.

**Independent Test**: Record lead over a 4-bar loop with deliberate rushing in bars 5–6 and a buzz in the loop only. The app reports "Loop detected" with the right length, points to bars 5–6 relative to the loop, and doesn't report the loop's buzz ([quickstart V6](./quickstart.md)).

**Depends on**: US1's engine (T042–T052) and landmark capture. Independent of US2.

### Tests for User Story 4 ⚠️

- [X] T079 [P] [US4] Create the synthetic mix helper `tests/helpers/synthMix.ts`. It builds a solo lead with known onsets (synth.ts), and lead-plus-loop mixes with the true live onsets and stroke landmarks attached. Mix types:
  - **Loop**: a repeating rhythm loop (length 2–16 s) at gain ratios 0.5×, 1× and 2× the lead
  - **Overdub**: the loop gains a layer halfway through
  - **Click track**: 3–4 kHz clicks
  - **Non-repeating backing**: drums plus bass-like content
  - **Unison**: the lead doubles the loop for 2 bars
  - **Loop only**: no lead
- [X] T080 [P] [US4] Write accompaniment detection tests in `tests/analysis/accompaniment/detect.test.ts`:
  - **Loop length**: estimated within ±10 ms for loops of 2, 4.5 and 12 s
  - **Classification**: `loop`, `backing`, `click` and `none` on the matching mixes
  - **Solo takes**: no false `loop` or `backing` on 20 synthetic solo variants (≤ 5% overall, SC-008)
- [X] T081 [P] [US4] Write separation and attribution tests in `tests/analysis/accompaniment/separate.test.ts`:
  - **Recall**: live-onset recall ≥ 90% and loop-onset leakage ≤ 10% at a 1× gain ratio
  - **Loop buzz**: a buzz placed only in the loop produces no `technique.fret_buzz` point
  - **Confidence**: `separationConfidence` is `good` at 0.5×, at most `partial` at 2×, and `poor` with no stroke landmarks and a 2× loop
  - **Unison**: emits the `unison_with_accompaniment` limitation for the doubled bars
- [X] T082 [P] [US4] Write accompaniment contract tests in `tests/analysis/accompaniment/contract.test.ts` for guarantees 8–11 and the loop-only part of guarantee 1:
  - `accompaniment: 'off'` gives a result deep-equal to the solo pipeline
  - `'on'` with no repetition gives `kind = 'backing'`
  - With accompaniment, `timingReference = 'accompaniment'`, and no accompaniment onset appears in any timing point's metrics
  - `poor` separation gives no clarity points and an `accompaniment_separation_low` limitation
  - The landmark analysers' output is identical between modes
  - A loop-only take gives `no_playing`

### Implementation for User Story 4

- [X] T083 [US4] Implement detection in `src/analysis/accompaniment/detect.ts`:
  - **Features**: beat-synchronous chroma and spectral features (dsp/chroma.ts).
  - **Repetition**: self-similarity, then autocorrelation over lags 1–60 s, then a sharpness and periodicity score. Refine the loop length to sample accuracy by cross-correlating the waveform around the peak lag.
  - **Click**: a regular train of short broadband transients centred in 2–5 kHz.
  - **Classification**: `loop` / `backing` / `click` / `none`, with thresholds from `thresholds.ts`.

  T080 must pass.
- [X] T084 [US4] Implement the accompaniment timing grid in `src/analysis/accompaniment/grid.ts`:
  - **Loop**: bars = loop length / n for the whole number n (1–8) that best explains the repeating part's onsets; the beat count is chosen likewise; phase is taken from the strongest repeating onsets.
  - **Click**: the click times are the grid.
  - **Backing**: the beat tracker from T043 run on the full mix.

  Output uses the same grid type as `beatGrid.ts`.
- [X] T085 [US4] Implement REPET separation in `src/analysis/accompaniment/repet.ts`:
  - **Windowed REPET for loops**: per-bin median of the magnitude spectrogram across a sliding window of 3–5 loop cycles gives the repeating model; a soft mask gives the live residual STFT and residual onset envelope.
  - **REPET-Sim for `backing`**: median over the k most similar frames.
  - **Changes**: mark sections where the model changes abruptly as `accompaniment_changed`.
  - **Short takes**: emit `too_few_loop_cycles` when there are fewer than 2 cycles, and fall back to backing handling.
  - **Memory**: process in chunks so peak memory stays within the 300 MB limit for a 5-minute take.
- [X] T086 [P] [US4] Implement click removal in `src/analysis/accompaniment/click.ts`: drop onsets within ±15 ms of a detected click whose spectrum is click-like; keep guitar onsets that coincide with clicks when their low-band energy is above the threshold
- [X] T087 [US4] Implement attribution in `src/analysis/accompaniment/attribution.ts`:
  - **Matching**: match residual onsets to picking-hand strokes from `detectStrokes` (T045) within ±50 ms.
  - **Per-onset confidence**:
    - High for matched onsets.
    - Medium for unmatched onsets with strong residual energy (probable legato).
    - Unmatched onsets with weak residual energy are dropped.
  - **`liveOnsetMatchRate`**: computed from the matches.
  - **`separationConfidence`**: `good` / `partial` / `poor`, from the mask energy ratio and the match rate.
  - **Limitations**: `unison_with_accompaniment` when the residual is near zero while strokes continue, and `accompaniment_too_loud` when the mask ratio is below the threshold.
- [X] T088 [US4] Implement accompaniment timing findings in `src/analysis/accompaniment/findings.ts`. Measure live onsets against the accompaniment grid, and emit:
  - `timing.locked_to_accompaniment`
  - `timing.ahead_of_accompaniment` (< −20 ms) and `timing.behind_accompaniment` (> +20 ms), overall or per beat position
  - `timing.lost_place_in_loop` (a stretch shifted consistently by ≥ ¼ beat)

  Add observation and suggestion templates for these codes and for the new limitation codes in `src/analysis/feedback-text/catalogue.ts`.
- [X] T089 [US4] Fill in the accompaniment stage hook in `src/analysis/index.ts`:
  - **Detection**: `off` skips the stage. `on` forces it, and falls back to `backing` when there is no repetition. `auto` runs it only when something is detected.
  - **Grid and onsets**: when the stage runs, use the accompaniment grid and the live residual onsets (`timingReference = 'accompaniment'`).
  - **Clarity**: pass per-onset live confidence to clarity (T048) so only onsets with confidence ≥ 0.7 count. Emit no clarity points when confidence is `poor`.
  - **Output**: populate `result.accompaniment`.
  - **No playing**: a loop-only take (no live onsets) is `no_playing`.
  - **Time budget**: stays within the 10 s engine budget for 60 s of input (measured in T112).

  T081 and T082 must pass, and T036–T039 must still pass.
- [X] T090 [US4] Persist accompaniment results:
  - **Reports**: update `saveReport` in `src/data/repositories/reportsRepo.ts` to write `accompanimentKind`, `loopLengthMs`, `timingReference`, `separationConfidence` and `liveOnsetMatchRate`.
  - **Takes**: add `setAccompanimentSetting(id, 'auto' | 'on' | 'off')` to `takesRepo.ts`.
  - **Runner**: pass `take.accompanimentSetting` into `AnalysisInput.accompaniment` in `src/jobs/runAnalysis.ts`.
  - **Tests**: extend `tests/unit/data/takesReportsRepo.test.ts`.
- [X] T091 [US4] Add the accompaniment setting to the Record screen: a segmented control `accompaniment-setting` (Auto / On / Off) in `src/features/record/AccompanimentSetting.tsx`. Pre-select it from `profile.lastAccompanimentSetting` (default `auto`), and write the chosen value back via `profileRepo.upsertProfile` when recording starts. Pass it to `recordingController.start` (FR-024). Show a tip when On: "Point the camera at your hands; keep the loop a bit quieter than your live playing"
- [X] T092 [US4] Add the accompaniment banner and re-analysis to the feedback screen:
  - **Banner**: `src/features/feedback/AccompanimentBanner.tsx` (`accompaniment-banner`) shows "Loop detected · 8.0 s loop · Separation: good", or Backing track / Click.
  - **Re-analysis**: `reanalyse-as-solo` and `reanalyse-with-accompaniment` call `setAccompanimentSetting`, then `analysisQueue.enqueue`, then navigate to `/take/[id]/analysing`. The new report replaces the old one (FR-029).
- [ ] T093 [US4] (human) Record at least 4 real lead-over-loop fixtures with a loop pedal through an amp and add them to `tests/fixtures/`:
  - `loop-lead-steady`
  - `loop-lead-rushing-bars5-6`
  - `loop-with-buzz-in-loop`
  - `click-track-strum`

  Each needs an `expected.json` (mustInclude / mustNotInclude) and `input.json` with `accompaniment: 'auto'`.
- [ ] T094 [US4] (optional) Write the Maestro flow `e2e/v6-loop.yaml`: set `accompaniment-setting` to On, record, then assert `accompaniment-banner` is visible. Tap `reanalyse-as-solo` and assert the banner disappears after re-analysis

**Checkpoint**: US4 works with US1 (and with US2 if present). Quickstart V6 passes on a device with a real loop pedal.

---

## Phase 6: User Story 3 - Track progress over time (Priority: P3)

**Goal**: Score trends per practice item and overall (filterable by solo or accompanied), recurring issues, practice stats, and side-by-side comparison of two takes.

**Independent Test**: Save ≥ 5 takes of one label over several days, with deliberate rushing in some. The Progress view shows timing and technique trends, lists `timing.rushing` as recurring with a count, and compare shows two takes side by side ([quickstart V4](./quickstart.md)).

**Depends on**: saved takes from US2 (the `saved` flag and labels). The filter uses `accompanimentKind` from the schema; US4 is not required, since without it every take is `none`.

### Tests for User Story 3 ⚠️

- [X] T095 [P] [US3] Write progress query tests in `tests/unit/data/progressRepo.test.ts` with seeded takes, reports and points:
  - **Score series**: per item and overall, only saved and analysed takes, ordered by `recordedAt`, null scores kept as gaps.
  - **Filters**: `all` / `solo` (`accompanimentKind = none`) / `accompanied`.
  - **Recurring issues**, over the last N = 10 saved, analysed takes: an issue is recurring when "`occurrences ≥ 3` and `occurrences / windowSize ≥ 0.4`". `firstSeenAt` and `lastSeenAt` are correct, and `typicalSeverity` is the most common severity.
  - **Stats**: take count, total `durationMs` of saved takes, and distinct local days with a take per ISO week.
  - **Not enough data**: `needsMoreTakes` is true when there are fewer than 2 data points.

### Implementation for User Story 3

- [X] T096 [US3] Implement the progress repository in `src/data/repositories/progressRepo.ts`: `scoreSeries({ practiceItemId?, filter })`, `recurringIssues({ practiceItemId?, window = 10 })` (with the display text from `recurringText` in T051) and `practiceStats({ practiceItemId? })`. T095 must pass
- [X] T097 [US3] Build the Progress screen `app/(tabs)/progress.tsx` with components in `src/features/progress/`:
  - **Item picker**: `progress-item-picker` (All, or a practice item).
  - **Filter**: `progress-accompaniment-filter` (All / Solo / Accompanied).
  - **Chart**: `chart-scores`, a victory-native line chart of timing and technique over time, with gaps for null scores and point markers by accompaniment kind.
  - **Recurring issues**: a list with `recurring-issue-<code>` items.
  - **Stats**: `stats-takes`, `stats-minutes`, `stats-days-per-week`.
  - **Not enough data**: a `need-more-takes` message when the series has fewer than 2 points.
- [X] T098 [US3] Build the compare screen `app/compare.tsx` (`/compare?a=<id>&b=<id>`), with components in `src/features/compare/`:
  - **Layout**: two `expo-video` players and two feedback summaries, `compare-a` and `compare-b` (stacked on narrow phones, side by side in landscape), with scores and top points for each take.
  - **Entry points**: from the library via a "Compare" multi-select mode in `src/features/library/` (select exactly 2), and from Progress ("Compare first and latest").
- [X] T099 [P] [US3] Write a component test in `tests/components/progressScreen.test.tsx`: `need-more-takes` appears with 1 take; the chart and a recurring issue render with seeded data; changing the filter updates the series
- [ ] T100 [US3] (optional) Write the Maestro flow `e2e/v4-progress.yaml`: seed via the dev-only seeding route `app/dev/seed.tsx` (creates labelled takes with reports from fixtures), open Progress, assert `chart-scores` and a `recurring-issue-timing.rushing` item, then open compare and assert `compare-a` and `compare-b`

**Checkpoint**: all four user stories work on their own. Quickstart V1–V6 pass.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Accuracy tuning (SC-003, SC-008, SC-009 tuning goals), performance on the Nothing Phone (4a) (SC-002), robustness and documentation.

- [ ] T101 [P] Write the evaluation protocol in `tools/eval/README.md`:
  - **Recording guidelines**: phone placement, a 30–90 s clip length, and a mix of solo and lead-over-loop takes, using your own guitar(s), amp and loop pedal, in the room where you practise.
  - **Privacy**: the set is stored outside git (`tools/eval/corpus/` is git-ignored).
  - **Label format**: `labels.json` per take: timing issues and technique issues as `{ issueCode, startMs, endMs }`, plus `accompaniment: none|loop|backing|click`. Labels are made by you (or a teacher, if one is available).
  - **Labelling tips**: label a take a day after recording it, from the video, before looking at the app's feedback, so the labels aren't anchored on what the app said.
  - **Agreement rule**: a finding agrees when its code matches and its time overlaps within ±1 s.
  - **Complete labelling**: label every issue you hear or see, not only the most important. Precision (T102) is only accurate if the labels are complete.
- [ ] T102 Write the evaluation harness `tools/eval/run.ts` (`npm run eval -- --corpus <path>`):
  1. Decode each take's audio (ffmpeg via `fluent-ffmpeg`, or a provided WAV).
  2. Load landmarks and run `analyseTake`.
  3. Compare the findings with the labels.
  4. Print and write `tools/eval/output/report.json`:
     - timing and technique **precision**: the share of the app's findings that match a label (same `issueCode` family, time overlap within ±1 s). This is the SC-003 tuning goal (≥ 80% and ≥ 70%)
     - timing and technique **recall**: the share of labels the app found. Reported for diagnosis, not as a target
     - loop detection rate and solo false-alarm rate (SC-008: ≥ 90% and ≤ 5%)
     - lead-over-loop timing precision and the share of clarity findings that came from the accompaniment (SC-009: ≥ 75% and ≤ 10%)
     - results per issue code
- [ ] T103 (human) Record and label a small tuning set following `tools/eval/README.md`: at least 15 solo takes and at least 8 lead-over-loop takes, labelled by you, in `tools/eval/corpus/` (not committed). Use `tools/eval/extract_landmarks.py` (T024) for landmarks, or copy each take's `landmarks.jsonl` off the phone with `adb pull`
- [ ] T104 Tune thresholds against the tuning set by running `npm run eval`. Adjust `src/analysis/config/thresholds.ts`, bump `ENGINE_VERSION` (e.g. `1.0.0+t2`), and record before and after metrics in `specs/001-guitar-practice-feedback/eval-results.md`. If the SC-003, SC-008 or SC-009 tuning goals are still missed, list the failing issue codes and the proposed analyser changes in the same file. Missing them does not block v1
- [ ] T105 Build the benchmark screen `app/dev/benchmark.tsx`. It must work in **release** builds, hidden behind `developer-toggle` (tap the version number in Settings 7 times; the flag is stored in the profile store, not shipped as a build flag):
  - **Runs**: `runAnalysis` on bundled 60 s and 300 s fixtures, solo and lead-over-loop.
  - **Measures**: end-to-end time, engine time, peak JS heap, and cold-start time to the Record screen (from app launch timestamp).
  - **Results**: record them in `specs/001-guitar-practice-feedback/benchmarks.md`, noting the phone, RAM variant and Android version.
  - **Targets** (Nothing Phone (4a), release build): 60 s fixture ≤ 30 s end-to-end and ≤ 10 s engine; 5-minute peak memory ≤ 300 MB; progress updates at least every 2 s; cold start ≤ 2 s.
- [ ] T106 If T105 misses the engine budget, profile and move the hottest `Dsp` operations (FFT/STFT and the REPET median) to C++ via Nitro Modules in `modules/rifflect-dsp/`, behind the existing `Dsp` interface. The TS implementation stays the default in Node and Jest, and T031 must pass against both implementations
- [ ] T107 [P] (optional) Do an accessibility pass across `src/features/**` and `src/ui/**`:
  - **Labels**: `accessibilityLabel` and `accessibilityRole` on every control and `testID` element.
  - **Text**: feedback text respects dynamic type (no fixed heights on point cards).
  - **Readouts**: scores are read aloud as "Timing 72 out of 100".
  - **Colour**: contrast passes WCAG AA in light and dark mode.
- [ ] T108 [P] (optional) Write the Maestro flow `e2e/v2-limits.yaml` (record talking only, then assert the no-playing state) and extend `e2e/smoke.yaml` to run all flows in order
- [ ] T109 [P] Write the root `README.md`: what Rifflect is; prerequisites from [quickstart.md](./quickstart.md); development setup (`npm install`, `npx expo prebuild --platform android`, `npx expo run:android`); the release build and install steps (`npm run build:apk`, `npm run install:apk`) with the keystore warning from T007; how to back up with "Export all"; npm scripts; project structure; a note that iOS is deferred; links to `specs/001-guitar-practice-feedback/`
- [ ] T110 Privacy check in `tests/unit/privacy.test.ts` (static scan): no `fetch`, `XMLHttpRequest`, `WebSocket` or `axios` usage in `src/**` or `app/**`, and no network-capable analytics SDKs in `package.json` dependencies (FR-014). Add a note to `README.md` that the app never sends take data off the phone
- [ ] T111 (human, device) Run the quickstart validation V1–V6 and the performance check on the Nothing Phone (4a) with an installed release build, including V3 steps 6–7 ("Export all" and an in-place update). Record pass or fail per scenario, with notes, in `specs/001-guitar-practice-feedback/validation.md`
- [ ] T112 Measure engine time for 60 s solo and 60 s lead-over-loop fixtures in Node, as a regression guard: `tests/analysis/perf.test.ts`, skipped in CI by default via `RUN_PERF=1`, fails if over 3 s on a desktop. On-device numbers come from T105

---

## Deferred: iOS (not part of v1)

**Purpose**: everything needed to add iPhone support later. Do not start these until iOS is back in scope. Shared TypeScript code must not assume Android in the meantime.

- [ ] T113 (device) Implement the iOS audio decoder in `modules/rifflect-audio-decoder/ios/RifflectAudioDecoderModule.swift` using `AVAssetReader` with `AVAssetReaderTrackOutput` (`kAudioFormatLinearPCM`, 32-bit float, 1 channel, 22,050 Hz). Same outputs, errors (including `E_DECODE_FAILED` for unreadable partial files) and `readPcmChunk` behaviour as T018
- [ ] T114 (device) Implement the iOS `HandLandmarker` hybrid object in `modules/rifflect-hand-landmarker/ios/HybridHandLandmarker.swift`:
  - **Dependency**: add the `MediaPipeTasksVision` pod dependency in `modules/rifflect-hand-landmarker/ios/RifflectHandLandmarker.podspec`.
  - **Behaviour**: same model options and output shape as T019, using `MPImage(sampleBuffer:orientation:)` and `detect(videoFrame:timestampInMilliseconds:)`.
- [ ] T115 (device) Implement the iOS landmark writer and `extractLandmarksFromVideo` in `modules/rifflect-hand-landmarker/ios/LandmarkWriter.swift` and `modules/rifflect-hand-landmarker/ios/LandmarkExtractor.swift` (`AVAssetImageGenerator` / `AVAssetReader`), matching T020 and T021
- [ ] T116 Set up iOS builds: create `eas.json` with a `development` profile (`developmentClient: true`) and a `preview` profile for internal distribution, register the iPhone, and document `eas build --profile development --platform ios` in `README.md`. Needs an Expo account and an Apple Developer account
- [ ] T117 (human, device) Re-run spikes T025–T026 and quickstart V1–V6 on an iPhone, add the iOS clock offset to `src/capture/clockOffset.ts`, and record results in `specs/001-guitar-practice-feedback/validation.md`

---

## Dependencies & Execution Order

### Phase dependencies

- **Phase 1 (Setup)**: no dependencies.
- **Phase 2 (Foundational)**: depends on Phase 1 and **blocks all stories**.
  - The data layer (T011–T015), native modules (T016–T023), landmark extraction script (T024), analysis core (T027–T032) and job queue (T033–T034) can proceed in parallel tracks.
  - The spikes (T025–T026) need T017, T019–T020 and T016, T018 on a device.
  - The app shell (T035) needs T012 and T034.
- **Phase 3 (US1, P1)**: needs Phase 2. **This is the MVP.**
- **Phase 4 (US2, P2)**: needs Phase 2 plus US1's capture and feedback screen (T054, T058, T063). It extends US1's screens rather than replacing them.
- **Phase 5 (US4, P2)**: needs US1's engine (T042–T052), the landmark pipeline (T058, T060) and the feedback screen (T063). Independent of US2.
- **Phase 6 (US3, P3)**: needs US2 (saved takes, labels). The solo/accompanied filter works without US4.
- **Phase 7 (Polish)**: T101, T102 and T107–T110 can start any time after Phase 2. T103–T106 and T111 need the stories they measure.
- **Deferred: iOS**: not scheduled for v1. When picked up, it needs Phase 2's TypeScript interfaces (T016, T017) and the Android implementations as a reference.

### User story dependency graph

```text
Setup ─► Foundational ─┬─► US1 (P1, MVP) ─┬─► US2 (P2) ─► US3 (P3)
   (spike gates T025/T026) │                  └─► US4 (P2)
                           └─► Polish: eval tooling (T101–T102), a11y, README (any time)
```

### Within each story

- Tests first, and confirm they fail (engine, repository and contract tests).
- Engine modules, then the orchestrator.
- Repositories, then the job runner, then screens.
- Maestro flow last; the story checkpoint then validates against quickstart.

---

## Parallel Examples

### Phase 2 (after T011–T012)

```text
Track A (data):      T013, T014, T015
Track B (native):    T016 → T018 ;  T017 → T019 → T020 → T021 ;  T024 (independent, Python)
Track C (engine):    T027, T028, T029, T030 → T031 → T032
Track D (queue):     T033 → T034
```

### User Story 1

```text
# Tests together:
T036 timing tests ∥ T037 technique tests ∥ T038 contract tests ∥ T039 fixture runner ∥ T040 repo tests

# Engine modules in parallel once T042–T044 are done:
T045 hands ∥ T048 clarity ∥ T049 posture/limitations ∥ T050 scoring ∥ T051 text catalogue
# then T046, T047 (need T045), then T052 orchestrator

# Capture/UI in parallel with the engine:
T053 profile repo ∥ T056 camera session ; then T055, T057 → T058 → T059
```

### User Story 4

```text
T079 synth mixes → (T080 ∥ T081 ∥ T082)
T083 detect → T084 grid ; T085 REPET ∥ T086 click → T087 attribution → T088 findings → T089 integrate
T091 record setting ∥ T092 banner (after T090)
```

### User Story 3

```text
T095 tests → T096 repo → (T097 progress screen ∥ T098 compare) ; T099 ∥ T100
```

---

## Implementation Strategy

### MVP first (US1 only)

1. Phase 1 Setup, then Phase 2 Foundational, including **both spike gates**. Act on the results before US1 capture work: if Spike A fails, the post-take landmark extraction (T021) becomes the primary path.
2. Phase 3 (US1). Stop and validate quickstart V1 and V2 on the Nothing Phone (4a) with an installed release build, in airplane mode.
3. Demo: record a take and get feedback, entirely on the phone.

### Incremental delivery

1. US1: feedback on a take (MVP).
2. US2: keep a library of takes (makes the app usable day to day).
3. US4: loop and backing-track support. This is the most technically risky part, so build it against synthetic mixes before real recordings.
4. US3: progress tracking (most useful once users have saved takes).
5. Polish: tuning against the SC-003, SC-008 and SC-009 goals on your own labelled takes; performance on the phone (SC-002).

Each increment ends with its checkpoint and the matching quickstart scenarios.

### Notes

- **Commits**: commit after each task or logical group.
- **Native code**: (device) tasks are verified on the Nothing Phone (4a) with locally built development or release builds. Timings only count from release builds.
- **Protect your takes**: from the first time you use the app for real, only install release builds signed with your one backed-up keystore (T007), and run "Export all" now and then.
- **Human tasks**: (human) tasks (T025, T026, T041, T093, T103, T111) are scheduling dependencies for whoever owns the guitar and the devices.
- **Engine purity**: never import React Native into `src/analysis/`. The ESLint rule from T004 enforces this.
- **Thresholds**: every threshold lives in `src/analysis/config/thresholds.ts`. Bump `ENGINE_VERSION` when one changes, so stored reports can be told apart.

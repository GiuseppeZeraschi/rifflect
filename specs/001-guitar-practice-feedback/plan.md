# Implementation Plan: AI Guitar Practice Feedback

**Branch**: `001-guitar-practice-feedback` | **Date**: 2026-11-11 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/001-guitar-practice-feedback/spec.md`, plus the user's direction: *"Use React Native so that the app is compatible with both Android and iPhone."*

## Summary

Rifflect is a cross-platform (iOS and Android) **React Native** app that:
- records a guitar practice take with the phone's camera and microphone
- analyses it **entirely on the phone** after the take ends
- gives written feedback with scores on timing and technique
- stores takes on the phone and tracks progress over time

**Technical approach**:
- **Recording**: VisionCamera records the take. A MediaPipe Hand Landmarker frame processor runs live, both to guide framing and to log hand landmarks while the user plays.
- **Analysis**: after stopping, the audio track is decoded natively. A pure-TypeScript engine runs onset/beat analysis and rule-based technique analysers, and fills in skill-level text templates.
- **Playing over a loop or backing track** (Story 4): the engine detects repeating loops, backing tracks and clicks. It takes the timing grid from the accompaniment and separates the live playing with REPET (repeating-pattern extraction). It then confirms live notes against picking-hand strokes from the camera, so feedback covers only what the player is playing live.
- **Storage**: results go to SQLite. Videos stay in app-private storage.

All decisions and alternatives are in [research.md](./research.md).

## Technical Context

**Language/Version**: TypeScript 5.x (strict) on React Native (New Architecture) via the latest stable Expo SDK at project start. Swift 5.9+ and Kotlin 2.x for two small local native modules.

**Primary Dependencies**:
- **Platform**: Expo (dev builds / EAS Build)
- **Camera and on-device ML**: react-native-vision-camera (recording and frame processors), MediaPipe Tasks Vision Hand Landmarker (iOS/Android SDKs)
- **Storage**: expo-sqlite + drizzle-orm, expo-file-system, expo-media-library, expo-sharing, expo-video-thumbnails (library thumbnails)
- **UI**: expo-video, expo-router, victory-native (Skia charts), zustand
- **Background work**: react-native-worklets-core (off-UI-thread analysis)

**Storage**: SQLite on the phone (metadata, reports, findings). App-private file storage for videos, landmark streams and thumbnails. No server and no cloud.

**Testing**:
- **Unit and component**: Jest + React Native Testing Library
- **Data layer**: Drizzle repositories tested on Node SQLite
- **Analysis engine**: fixture suite (real clips + landmark JSONL)
- **End-to-end**: Maestro flows on devices
- **Accuracy**: Node evaluation harness over a labelled corpus (SC-003)

**Target Platform**: iOS 16+ (iPhone XR/A12 and newer). Android 8.0+ (API 26) with ≥ 4 GB RAM. Reference performance devices are iPhone 12-class and Snapdragon 7-series (2021+) Android.

**Project Type**: Mobile app (single cross-platform codebase, no backend).

**Performance Goals**:
- **Feedback speed** (SC-002): feedback for a 1-minute take within 30 s, with the engine alone ≤ 10 s.
- **Camera**: preview at 30 fps with the frame processor at 12 fps and no dropped recording frames.
- **App**: cold start to the Record screen ≤ 2 s.

**Constraints**:
- **Privacy and offline**: no take data leaves the phone (FR-014), and the full app works offline (FR-018).
- **Take length**: 5 s – 5 min (FR-004).
- **Memory**: peak memory during analysis ≤ 300 MB for a 5-minute take (PCM is read in chunks).
- **Handedness**: works for left- and right-handed players.

**Scale/Scope**:
- One user per install.
- Up to ~500 saved takes (storage limited by the phone, ~10–40 MB per minute of video).
- ~10 screens, 2 local native modules, ~20 issue codes in v1.
- 4 user stories: P1 feedback, P2 library, P2 loop/backing track, P3 progress.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

`.specify/memory/constitution.md` is still the unfilled template. It defines no principles, so there are **no gates to evaluate**. Status: **PASS (vacuous)**, both before research and after design.

Recommendation: run `/speckit-constitution` before `/speckit-tasks` if the project should enforce principles such as test-first, privacy-by-default or accessibility. This plan already follows these defaults: privacy by design (FR-014), a testable pure-TypeScript core, and the simplest workable approach (rule-based analysers, templated text, no backend).

## Project Structure

### Documentation (this feature)

```text
specs/001-guitar-practice-feedback/
├── spec.md
├── plan.md              # this file
├── research.md          # Phase 0
├── data-model.md        # Phase 1
├── quickstart.md        # Phase 1
├── contracts/
│   ├── analysis-engine.md
│   ├── native-modules.md
│   └── screens.md
├── checklists/requirements.md
└── tasks.md             # Phase 2 (/speckit-tasks, not created here)
```

### Source Code (repository root)

```text
app/                              # expo-router routes (see contracts/screens.md)
├── _layout.tsx
├── onboarding.tsx
├── recover.tsx
├── compare.tsx
├── (tabs)/
│   ├── record.tsx
│   ├── library.tsx
│   ├── progress.tsx
│   └── settings.tsx
└── take/[id]/
    ├── index.tsx
    ├── analysing.tsx
    └── edit.tsx

src/
├── analysis/                     # PURE TS engine, no RN imports (contracts/analysis-engine.md)
│   ├── index.ts                  # analyseTake()
│   ├── dsp/                      # fft, stft, spectral flux, autocorrelation (swappable for JSI)
│   ├── timing/                   # onsets, beat grid, tempo estimate, offset metrics
│   ├── technique/                # fretting-hand, picking-hand, clarity, posture analysers
│   ├── accompaniment/            # detection, loop length, accompaniment beat grid, REPET separation, onset↔stroke attribution
│   ├── scoring/
│   ├── feedback-text/            # issue-code catalogue + skill-level templates
│   └── config/thresholds.ts      # versioned constants (ENGINE_VERSION)
├── capture/                      # camera session, framing check, recording controller
├── jobs/                         # analysis job queue, recovery on start
├── data/
│   ├── db/schema.ts              # drizzle schema (data-model.md)
│   ├── db/migrations/
│   ├── repositories/             # takes, reports, practice items, progress queries
│   └── files/                    # take folder management, storage accounting
├── native/                       # typed wrappers + mocks for local modules
├── features/                     # screen-level components: record, feedback, library, progress, compare, settings
└── ui/                           # shared components, theme, accessibility helpers

modules/
├── rifflect-hand-landmarker/     # Expo module: VisionCamera plugin + MediaPipe (ios/, android/, src/)
└── rifflect-audio-decoder/       # Expo module: decode audio track to PCM

assets/models/hand_landmarker.task

tests/
├── unit/                         # mirrors src/
├── analysis/                     # engine fixture suite + contract guarantees
├── fixtures/                     # audio clips, landmark JSONL, expected findings
└── components/

e2e/                              # Maestro flows (V1–V5 from quickstart)
tools/eval/                       # accuracy harness (Node) + landmark extraction script (Python MediaPipe)
```

**Structure Decision**: This is a single Expo/React Native app at the repository root, with no `api/` or backend because all processing is on the phone (FR-014).
- **Analysis engine**: kept in `src/analysis/` with no React Native dependencies, so it is unit-testable and reusable by `tools/eval/`.
- **Native code**: limited to two small local Expo modules in `modules/`.

## Phase ordering & key risks (input for `/speckit-tasks`)

1. **Spike first, before building on it**:
   - **(a) Live landmarks**: the MediaPipe frame processor running at 12 fps during 1080p30 recording on a reference Android device.
   - **(b) Clock alignment**: landmark timestamps vs. decoded-audio timestamps, tolerance ±20 ms.

   Failure fallbacks are in research R3 and R4.
2. **Analysis engine timing path** with synthetic and fixture tests. This is independent of the phone, so it can run in parallel with the spikes.
3. **P1 slice** (Story 1): onboarding → record → analyse → feedback screen.
4. **P2 slice** (Story 2): save, library, delete, export, recovery.
5. **P2 slice** (Story 4): accompaniment pipeline in the engine, built against synthetic mixes first (solo lead + looped rhythm at known gains), then the Record-screen setting, feedback banner and re-analysis. It builds on the solo timing path from step 2 and the landmark stream from step 3.
6. **P3 slice** (Story 3): progress queries, charts, recurring issues, compare, solo/accompanied filter.
7. **Accuracy corpus and evaluation**: tune thresholds against SC-003, SC-008 and SC-009. The corpus needs real lead-over-loop takes from several loopers and amps. On-device benchmark for SC-002, including an accompaniment fixture.

**Top risks**:
- Technique accuracy from hand landmarks alone (SC-003 at 70%). *Mitigation*: confidence floor, honest limitations, threshold tuning on the corpus.
- Timing accuracy without a metronome: a consistently unsteady player can pull the detected beat with them (research R6). *Mitigation*: report drift and within-beat spread, and validate against teacher labels in the SC-003 corpus. A built-in metronome can be added later if needed.
- Separating live guitar from a loop of the same guitar through the same amp (SC-009). *Mitigation*: REPET exploits the loop's exact repetition, the camera's picking-hand strokes confirm live notes, clarity feedback is suppressed when attribution is weak, and unison and changing loops are reported as limitations (research R16).
- Performance on older Android phones. *Mitigation*: tiered frame rate, chunked PCM, JSI escape hatch for DSP.

## Complexity Tracking

There are no constitution violations to justify.

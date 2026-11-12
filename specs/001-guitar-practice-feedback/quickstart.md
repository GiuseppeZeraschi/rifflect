# Quickstart & Validation Guide: AI Guitar Practice Feedback

This guide shows how to run the app and check that each user story works from start to finish. For details see the [plan](./plan.md), [data model](./data-model.md) and [contracts](./contracts/).

## Prerequisites

- Node.js LTS, npm, Git.
- **Android**: Android Studio + SDK (includes `adb`), a JDK as required by the Expo SDK, and the **Nothing Phone (4a)** with Developer options and USB debugging enabled. The full flow needs a real camera and microphone.
- A guitar, and a phone stand or clamp.
- Optional: Maestro CLI, for the end-to-end smoke flow.
- Not needed for v1: an Expo account, EAS, a Mac or an Apple account (iOS is deferred).

## Setup (development)

```bash
npm install
npx expo prebuild --platform android   # generates android/ including the local modules
npx expo run:android --device          # debug build + Metro, for development only
```

## Release build and install (daily use)

Do this once to create the signing key. **Keep the keystore and its passwords safe and backed up (e.g. a password manager plus an off-laptop copy). If they're lost, future updates can't be installed without uninstalling, and uninstalling deletes every take.**

```bash
# One-time: create the release keystore OUTSIDE the repo
keytool -genkeypair -v -keystore %USERPROFILE%\keys\rifflect-release.jks -alias rifflect -keyalg RSA -keysize 2048 -validity 10000
# Then add to %USERPROFILE%\.gradle\gradle.properties (never commit these):
#   RIFFLECT_STORE_FILE=C:/Users/<you>/keys/rifflect-release.jks
#   RIFFLECT_KEY_ALIAS=rifflect
#   RIFFLECT_STORE_PASSWORD=...
#   RIFFLECT_KEY_PASSWORD=...
```

Every time you want to install a new version:

```bash
npm run build:apk      # expo prebuild + gradlew assembleRelease, signed by plugins/withReleaseSigning.js
npm run install:apk    # adb install -r <apk>: updates in place and keeps all takes
```

**Expected**: the app updates without losing takes. Don't install a debug build over the release build (or the reverse); the signatures differ and Android will refuse, or require an uninstall.

## Automated checks

```bash
npm run typecheck            # tsc --noEmit
npm test                     # Jest: analysis engine, scoring, templates, repositories, components
npm run test:analysis        # engine fixture suite only (tests/analysis)
npm run eval -- --corpus <path>   # accuracy harness (SC-003 tuning goal), prints precision and recall per category
maestro test e2e/smoke.yaml  # optional: end-to-end smoke flow on the connected phone
```

**Expected**: all green. `test:analysis` includes the contract guarantees in [analysis-engine.md](./contracts/analysis-engine.md#guarantees-tested). The eval harness prints timing and technique precision; the tuning goals are ≥ 80% and ≥ 70%, but missing them doesn't block v1.

**Where to run the manual scenarios**: on the Nothing Phone (4a) with an installed **release** build, unless a step says otherwise.

## Manual validation scenarios

### V1: First take with feedback (Story 1, SC-001, SC-002)

1. Fresh install, then open the app. Complete onboarding: allow permissions, choose right-handed, beginner.
2. On Record, prop the phone so both hands are in view, with the fretting hand fully in frame. `framing-status` shows **ok**.
3. Cover the fretting hand. The status changes to `fretting_out_of_frame` with a hint.
4. Enter a target tempo of 80 BPM, record about 60 s of quarter-note strumming at roughly that tempo, then stop.
5. **Expected**:
   - The analysing screen shows progress, and feedback appears within 30 s.
   - There is ≥ 1 timing point and ≥ 1 technique point.
   - Timing feedback states the tempo actually played and how far it was from the 80 BPM target.
   - Tapping a point seeks the video to that time.
   - Time from opening the app to feedback is under 3 minutes.
6. Repeat with airplane mode on. **Expected**: same result (no network needed, FR-014).

### V2: Honest limits (FR-012, edge cases)

1. Record 15 s of talking without playing. **Expected**: a "couldn't find playing to analyse" message, no points, no scores.
2. Record while playing in very dim light. **Expected**: technique coverage is reduced and a `low_light` limitation is shown. Timing feedback is still present.
3. Record for less than 5 s. **Expected**: a message about the minimum length, and no analysis.
4. Set handedness to left in settings, flip the guitar, record. **Expected**: fretting- and picking-hand feedback refer to the correct hands.

### V3: Save, library, delete, export (Story 2)

1. Save the V1 take with the label "G–C–D strumming". Discard another take.
2. **Expected**: the library shows only the saved take, newest first, with date, duration, label and summary.
3. Force-quit, restart the phone, and reopen in airplane mode. **Expected**: the take plays and its feedback is intact (SC-007).
4. Export to Photos. **Expected**: the video appears in the camera roll.
5. Delete it (with confirmation). **Expected**: it is gone from the library, and the storage used goes down.
6. Save two more takes, then Settings → `export-all`, and pick a folder (e.g. a `Rifflect backups` folder in Documents). **Expected**: a `rifflect-export-<date>` folder containing `takes.json` and one sub-folder per saved take with `video.mp4` and `feedback.txt` ([data-model.md](./data-model.md#export-all-backup-layout-fr-031)). Unsaved takes are not included.
7. Build and install a new release APK (`npm run build:apk && npm run install:apk`). **Expected**: the update installs in place, and every saved take, label and score is still there (SC-007).

### V4: Progress (Story 3)

1. Save one take for a new label, then open Progress for that label. **Expected**: the `need-more-takes` message.
2. Save ≥ 5 takes of the same label, deliberately rushing in some. **Expected**:
   - The chart shows timing and technique lines.
   - `timing.rushing` appears as recurring with a count, e.g. "in 3 of your last 5 takes".
   - Practice stats show take count, total minutes and days per week.
3. Compare the first and latest take. **Expected**: both videos and their feedback are shown side by side.

### V5: Interruptions and storage (edge cases)

1. While recording, trigger an incoming call, or background the app. Return. **Expected**: the take is kept as interrupted, and `/recover` offers Analyse or Discard.
2. Kill the app during analysis, then relaunch. **Expected**: analysis resumes or is offered again.
3. Fill the device until free space is below the threshold. **Expected**: `storage-warning` appears before recording and before saving.

### V6: Playing over a loop or backing track (Story 4; SC-008, SC-009 tuning goals)

1. With the accompaniment setting on **Auto**, record a 4-bar rhythm loop into a loop pedal through an amp. Then record a 60 s take playing lead over it. Rush the lead deliberately in bars 5–6, and leave a single buzzing note in the *loop* only.
2. **Expected**:
   - `accompaniment-banner` shows "Loop detected", with a loop length close to the pedal's loop, and a separation confidence.
   - Timing points describe the lead relative to the loop (`timing.ahead_of_accompaniment`), and point to bars 5–6.
   - No `technique.fret_buzz` point is reported for the loop's buzzing note.
3. Tap `reanalyse-as-solo`. **Expected**: the take is re-analysed with no accompaniment, and the banner disappears. The feedback now mixes in loop notes, which shows why the mode matters. Switch back with `reanalyse-with-accompaniment`.
4. Play the lead in exact unison with the loop for 2 bars. **Expected**: a `unison_with_accompaniment` limitation covering those bars.
5. Turn the loop up much louder than the live guitar. **Expected**: separation confidence is `poor`, the `accompaniment_too_loud` / `accompaniment_separation_low` limitations appear, and there are no clarity points.
6. Record a solo take (no loop) on **Auto**. **Expected**: no accompaniment detected, and the feedback matches solo behaviour.
7. Play along with a phone metronome app through a speaker. **Expected**: the click is detected (`kind = click`), timing is measured against the click, and the clicks are not reported as the player's notes.
8. In Progress, switch `progress-accompaniment-filter` between all, solo and accompanied. **Expected**: the chart and stats update accordingly.

**Automated**: `npm run test:analysis` includes synthetic-mix fixtures. Each mixes a solo lead with known onsets and a looped rhythm part at known gain ratios, and asserts guarantees 8–11 in [analysis-engine.md](./contracts/analysis-engine.md#guarantees-tested).

## Performance check (SC-002)

In the installed **release** build, tap the version number in Settings 7 times to reveal Developer → Benchmark. Run the 60 s and 300 s fixtures. (Debug builds are much slower and their numbers don't count.)

**Expected on the Nothing Phone (4a)**:
- 60 s fixture: end-to-end ≤ 30 s, and the engine alone ≤ 10 s, both for the solo fixture and for the lead-over-loop fixture.
- 300 s fixture: it finishes, and progress updates at least every 2 s.

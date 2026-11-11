# Feature Specification: AI Guitar Practice Feedback

**Feature Branch**: `001-guitar-practice-feedback`

**Created**: 2026-11-11

**Status**: Draft

**Input**: User description: "Build a guitar companion app that uses the phone's camera and microphone to observe guitar playing using AI and give text feedback on aspects such as timing and technique. User's should be able to store the videos on their phone and track their progress over time"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Record a practice take and get feedback (Priority: P1)

A guitarist props their phone up so the camera can see their hands and guitar, starts a recording, plays a passage (a riff, scale, chord progression or song section), and stops. The app analyses the audio and video and presents written feedback on timing (e.g. rushing or dragging, uneven rhythm, consistency against the chosen tempo) and technique (e.g. fretting-hand position, muted or buzzing notes, picking/strumming consistency). Each feedback point says what was observed, roughly where in the take it happened, and a suggestion for improvement.

**Why this priority**: This is the core value of the product — without useful feedback on a take, storage and progress tracking have nothing to track.

**Independent Test**: Can be fully tested by recording a single take and confirming the user receives readable, specific feedback covering timing and technique, with no other features present.

**Acceptance Scenarios**:

1. **Given** the user has granted camera and microphone access, **When** they record a 30-second take and stop recording, **Then** they receive written feedback containing at least one timing observation and at least one technique observation.
2. **Given** a feedback point refers to a specific moment, **When** the user taps it, **Then** playback of the take jumps to that moment.
3. **Given** the user entered a target tempo before recording, **When** feedback is shown, **Then** it states the tempo they actually played and how far it was from the target.
4. **Given** the camera cannot clearly see both hands, or the fretting hand is partly out of frame or the light is too low, during setup, **When** the user is about to record, **Then** the app warns them and suggests how to reposition the phone.

---

### User Story 2 - Save and revisit takes on the phone (Priority: P2)

After receiving feedback, the user saves the take to their phone. They can later browse their saved takes (most recent first), name or tag them with what they were practising (e.g. "F barre chord", "Song X – solo"), replay the video, re-read the feedback, and delete takes they no longer want.

**Why this priority**: Keeping a personal library of takes and their feedback lets users review advice and is a prerequisite for meaningful progress tracking.

**Independent Test**: Can be tested by saving several takes, closing and reopening the app, and confirming each take's video, label and feedback are still available and deletable.

**Acceptance Scenarios**:

1. **Given** a completed take with feedback, **When** the user saves it, **Then** the video and its feedback are stored on the phone and appear in the take library.
2. **Given** saved takes exist, **When** the user opens the library, **Then** takes are listed newest first with date, duration, label and a short feedback summary.
3. **Given** a saved take, **When** the user deletes it and confirms, **Then** the video and its feedback are removed from the phone and storage is freed.
4. **Given** the user does not want to keep a take, **When** they discard it after viewing feedback, **Then** nothing is stored.
5. **Given** the user left a take without saving or discarding it, **When** they open the library, **Then** the take appears in a "Not saved yet" section showing when it will be removed, and they can open, save or discard it.

---

### User Story 3 - Track progress over time (Priority: P3)

The user views their progress for a given practice item (label) or overall. The app shows how timing and technique scores have changed across their saved takes over time, highlights recurring issues (e.g. "rushing on beat 4 in 6 of your last 8 takes"), and lets them compare an early take side by side with a recent one.

**Why this priority**: Progress tracking drives motivation and retention, but it depends on stories 1 and 2 and only becomes useful once several takes exist.

**Independent Test**: Can be tested by saving at least five takes of the same practice item over several days and confirming the progress view shows a trend for timing and technique and lists recurring issues.

**Acceptance Scenarios**:

1. **Given** at least two saved takes share a label, **When** the user opens progress for that label, **Then** they see timing and technique scores plotted over time.
2. **Given** an issue appears in several recent takes, **When** the user views progress, **Then** the issue is listed as recurring with how often it occurred.
3. **Given** two takes of the same item, **When** the user chooses to compare them, **Then** both videos and their feedback are shown side by side.
4. **Given** fewer than two takes exist for an item, **When** the user opens progress, **Then** the app explains that more takes are needed to show a trend.

---

### User Story 4 - Get feedback while playing over a loop or backing track (Priority: P2)

A guitarist records a rhythm part into a loop pedal (or starts a backing track, drum machine or external metronome) and then plays lead over it. The phone hears both the accompaniment and the live playing through one microphone. The app recognises the accompaniment and uses its beat as the timing reference. It separates the live playing from the accompaniment, and gives feedback only on what the player is playing live: how tightly the lead sits against the loop, and the clarity and technique of the lead.

**Why this priority**: Playing over loops and backing tracks is a common way to practise lead guitar. Without this, the accompaniment's notes are counted as the player's, and timing and clarity feedback become misleading. It ranks below the core single-guitar flow (Story 1) because it builds on the same analysis.

**Independent Test**: Record a 4-bar rhythm loop, then record a take playing lead over it with deliberate timing errors in known places. Confirm that the app says it detected a loop, and that the timing feedback points to the lead's errors, not the loop's notes.

**Acceptance Scenarios**:

1. **Given** accompaniment detection is on Auto (the default), **When** the user records lead over a repeating loop, **Then** the feedback shows that a loop was detected, its length, and that timing was measured against it.
2. **Given** a loop was detected, **When** feedback is shown, **Then** timing observations describe the live part's position relative to the loop's beat (e.g. "your lead notes landed about 30 ms behind the loop on beat 2").
3. **Given** the accompaniment contains a buzzing or muted note, **When** the live part is clean, **Then** the app does not report that buzz or muted note as a problem in the user's playing.
4. **Given** the app could only partly separate the live playing from the accompaniment, **When** feedback is shown, **Then** it says that confidence is reduced, and holds back clarity feedback it cannot attribute reliably.
5. **Given** the app analysed a take as solo playing but the user was playing over accompaniment (or the reverse), **When** the user changes the setting on the feedback screen, **Then** the take is re-analysed in the chosen mode and the feedback is replaced.
6. **Given** the user plays along with an external metronome click, **When** feedback is shown, **Then** timing is measured against the click and the click is not reported as the player's notes.

---

### Edge Cases

- No guitar is detected, or the recording contains only talking or silence: the app says it could not find playing to analyse rather than inventing feedback.
- Only the loop or backing track is heard and the user never plays live: the app says it found no live playing to analyse, rather than giving feedback on the accompaniment.
- Loop changes during the take (an overdub layer is added, or the loop is stopped or restarted): the app follows the change where it can, and marks the affected sections as having reduced confidence.
- Backing track that doesn't repeat exactly (e.g. a full song): the app still takes the beat from it, but separates the live playing less well and says so.
- Accompaniment much louder than the live guitar: the app warns that the live part was hard to hear and limits feedback.
- The live part plays in unison with the loop (doubling it exactly): the app cannot tell the two apart for those notes, and says so instead of guessing.
- Legato playing (hammer-ons, pull-offs, tapping) over a loop: notes without a visible picking stroke are harder to attribute, which may reduce confidence for those passages.
- Very noisy environment (TV, other instruments, backing track too loud): feedback is still given where possible, with a notice that audio quality reduced accuracy.
- Poor lighting, hands out of frame, or phone moved mid-take: technique feedback is limited to the parts that were visible and the app says so.
- Very short take (under 5 seconds) or very long take (over the maximum length): the app explains the limits.
- Phone storage nearly full: the app warns before recording and before saving, and shows how much space takes are using.
- Recording interrupted by a phone call or the app being sent to the background: the partial take is kept and can be analysed or discarded. If the app crashes or the phone loses power while recording, the take may not be recoverable; the app says so on next launch.
- Analysis finishes after the user has left the analysing screen: the app shows an in-app notice that links to the feedback.
- Left-handed players: analysis must work for both left- and right-handed playing.
- Camera or microphone permission denied: the app explains why it needs access and how to grant it; it does not attempt to record.
- Analysis cannot complete (e.g. app closed mid-analysis, phone low on battery or overheating): the take is kept and the user can request feedback again later.
- Older or lower-powered phones: analysis may take longer; the app shows progress and the user can leave the screen while it finishes.

## Requirements *(mandatory)*

### Functional Requirements

**Recording**

- **FR-001**: Users MUST be able to record a practice take using the phone's camera and microphone together.
- **FR-002**: System MUST show a live camera preview with framing guidance before and during recording so the user can position the phone to see both hands, with the fretting hand fully in frame.
- **FR-003**: Users MUST be able to optionally enter a target tempo (in BPM) before recording. The app plays no sound during recording (no metronome or count-in).
- **FR-004**: System MUST support takes between 5 seconds and 5 minutes long.
- **FR-005**: System MUST let users set their handedness (left or right) and skill level (beginner, intermediate, advanced) once, and use them for all analysis.

**Feedback**

- **FR-006**: System MUST analyse each take and produce written feedback in plain language covering timing and technique. Feedback is produced only after the take is finished; no feedback is shown while the user is playing.
- **FR-007**: Timing feedback MUST address tempo consistency and whether notes/strums are early or late relative to the beat: the player's own detected beat for solo takes, or the accompaniment's beat when accompaniment is present (FR-026). If a target tempo was entered, feedback also compares the played tempo with it.
- **FR-008**: Technique feedback MUST address, where observable, fretting-hand position, picking/strumming-hand motion, clarity of notes (buzzing, muting, unintended open strings) and posture.
- **FR-009**: Each feedback point MUST include what was observed, the approximate time in the take, and a concrete suggestion for improvement.
- **FR-010**: System MUST give each take a timing score and a technique score on a 0–100 scale, plus a one-line overall summary.
- **FR-011**: System MUST tailor the wording and depth of feedback to the user's skill level.
- **FR-012**: System MUST state when it could not analyse part of a take (not visible, too noisy, no playing detected) instead of guessing.
- **FR-013**: Users MUST be able to tap a feedback point to play the take from that moment.
- **FR-014**: All analysis MUST happen on the phone. Recordings, audio, video frames and feedback MUST NOT be sent off the phone for analysis, and feedback MUST be available without an internet connection.

**Storage**

- **FR-015**: Users MUST be able to save a take's video together with its feedback, label and scores to their phone, or discard it. Unsaved takes are listed separately in the library and are automatically removed after 24 hours.
- **FR-016**: Users MUST be able to browse, search by label, replay, rename/relabel and delete saved takes.
- **FR-017**: System MUST show total storage used by saved takes and warn when phone storage is low.
- **FR-018**: Saved takes MUST remain available after the app is closed or the phone is restarted, and MUST be viewable without an internet connection.
- **FR-019**: Users MUST be able to export or share a saved take's video to the phone's photo/video library or other apps.

**Progress**

- **FR-020**: System MUST show timing and technique scores over time, per label and overall.
- **FR-021**: System MUST identify recurring issues across a user's recent takes and show how often each occurs.
- **FR-022**: Users MUST be able to compare two saved takes side by side, including their videos and feedback.
- **FR-023**: System MUST show basic practice statistics: number of takes, total recorded practice time, and practice days per week.

**Playing over a loop or backing track**

- **FR-024**: Users MUST be able to set accompaniment handling before recording to **Auto** (default), **On** (playing over accompaniment) or **Off** (solo playing).
- **FR-025**: In Auto mode, System MUST detect whether the take contains repeating loop playback or other accompaniment (backing track, drum machine, metronome click). The result MUST be shown on the feedback screen, including the loop length when a loop is found.
- **FR-026**: When accompaniment is present, System MUST use the accompaniment's beat as the timing reference and describe the live part's timing relative to it.
- **FR-027**: When accompaniment is present, System MUST separate the live playing from the accompaniment, and base timing, clarity and technique feedback only on the live playing.
- **FR-028**: System MUST give a separation-confidence level (good, partial, poor) for each take with accompaniment. Clarity feedback MUST be suppressed where the live playing cannot be reliably attributed, and the feedback MUST say so.
- **FR-029**: Users MUST be able to re-analyse a take with a different accompaniment setting from the feedback screen, which replaces its feedback.
- **FR-030**: Progress tracking MUST record which takes were played over accompaniment, and let users filter progress by solo or accompanied takes.

### Key Entities

- **Player profile**: The user's settings that shape analysis — handedness, skill level. One per app install.
- **Take**: A single recording session. Attributes: date/time, duration, video, optional target tempo, accompaniment setting (Auto/On/Off), label/practice item, saved or discarded status.
- **Accompaniment analysis**: What the app found about accompaniment in a take. Attributes: whether accompaniment was present, its kind (loop, backing track, click), loop length, the timing reference used (own playing or accompaniment), separation confidence. Belongs to a feedback report.
- **Feedback report**: The analysis of one take. Attributes: timing score, technique score, overall summary, list of feedback points, notes on parts that couldn't be analysed. Belongs to exactly one take.
- **Feedback point**: A single observation within a report. Attributes: category (timing or technique), time in the take, what was observed, suggestion, severity.
- **Practice item (label)**: What the user was practising (e.g. a chord, scale or song section). Groups takes for progress tracking.
- **Recurring issue**: A type of feedback point seen across multiple takes of an item, with frequency and first/last seen dates. Derived from feedback reports.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A new user can go from opening the app for the first time to reading feedback on their first take in under 3 minutes.
- **SC-002**: On supported phones, feedback for a 1-minute take is available within 30 seconds of the user stopping the recording in 90% of cases, with no internet connection.
- **SC-003**: In a panel review, guitar teachers agree with at least 80% of timing observations and 70% of technique observations on a test set of takes.
- **SC-007**: 100% of saved takes remain playable, with their feedback, after the app is closed and reopened, including with no internet connection.
- **SC-008**: On a test set of lead-over-loop takes, Auto mode correctly detects the loop in at least 90% of takes. It wrongly reports accompaniment in no more than 5% of solo takes.
- **SC-009**: On lead-over-loop takes, guitar teachers agree with at least 75% of timing observations. No more than 10% of reported clarity problems turn out to come from the accompaniment instead of the live playing.

### Product goals (post-launch; not v1 acceptance criteria)

These are not measured by the app or required for v1 acceptance; the app collects no usage analytics (FR-014). The IDs are kept so they remain referenceable.

- **SC-004**: At least 75% of surveyed users rate the feedback as "useful" or "very useful".
- **SC-005**: Users who save at least 5 takes of the same item see a visible trend in their progress view, and at least 60% of such users report it helps them understand their improvement.
- **SC-006**: At least 40% of users who record a take in their first week record another in their fourth week.

## Assumptions

- Target users are self-taught or lesson-taking guitarists from beginner to intermediate level, playing acoustic or electric guitar in standard tuning; bass and other instruments are out of scope for v1.
- The user props or mounts the phone themselves; the app provides framing guidance but no hardware.
- v1 checks framing from hand visibility and lighting; it does not detect the guitar neck itself.
- Single live player only. The app analyses one guitarist playing live per take. Recorded accompaniment (the player's own loops, backing tracks, drum machines, clicks) is supported, but playing live with other people (duets/bands) is out of scope.
- Accompaniment is heard through the same microphone (from an amp or speaker). Separate audio inputs (e.g. a multi-channel USB audio interface) are out of scope for v1.
- AI analysis runs entirely on the phone, so the whole app works offline. A minimum phone capability (to be set during planning) is needed for analysis within the SC-002 target.
- No user account is required in v1; all takes, feedback and progress live on the phone. Cloud backup and syncing between devices are out of scope for v1.
- Recordings and feedback are personal data belonging to the user; they are never shared with anyone unless the user explicitly exports or shares them.
- Feedback is in English for v1.
- The app has no built-in metronome, count-in or backing tracks in v1, and plays no sound while recording. Timing is judged against the accompaniment's beat when the user plays over one, otherwise against the player's own detected beat.
- Feedback is about timing and technique, not about which notes are correct for a specific song; checking against sheet music or tabs is out of scope for v1.
- The app runs on modern iOS and Android phones with a working front or rear camera and microphone.

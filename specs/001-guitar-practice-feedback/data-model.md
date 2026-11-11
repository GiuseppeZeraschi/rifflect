# Data Model: AI Guitar Practice Feedback

**Feature**: [spec.md](./spec.md) | **Research**: [research.md](./research.md)

All data lives on the phone (FR-014, FR-018).
- **Structured data**: stored in SQLite.
- **Media and landmark streams**: stored as files in app-private storage under `takes/<takeId>/`.
- **IDs**: generated on the device as UUID v7, which sorts by time.
- **Timestamps**: ISO-8601 UTC strings. Durations and offsets are in milliseconds.

## Entity overview

```text
PlayerProfile (1)

PracticeItem 1 ──< Take 1 ──1 FeedbackReport 1 ──< FeedbackPoint
                     │
                     └── files: video.mp4, landmarks.jsonl, (temp) audio.f32

RecurringIssue = derived view over FeedbackPoint × Take × PracticeItem
```

## PlayerProfile

One row per install. It is created during onboarding and used in every analysis (FR-005, FR-011).

| Field | Type | Rules |
|---|---|---|
| id | text PK | always `"me"` |
| handedness | enum `right` \| `left` | required |
| skillLevel | enum `beginner` \| `intermediate` \| `advanced` | required |
| preferredCamera | enum `front` \| `back` | default `front` |
| createdAt / updatedAt | text | |

## PracticeItem (label)

Groups takes by what was practised (Story 2, Story 3).

| Field | Type | Rules |
|---|---|---|
| id | text PK | |
| name | text | 1–60 chars, trimmed, unique ignoring case |
| createdAt | text | |
| lastUsedAt | text | updated when a take is saved with this item |

Deleting an item does not delete its takes. Their `practiceItemId` becomes null, and they show as "Unlabelled".

## Take

| Field | Type | Rules |
|---|---|---|
| id | text PK | also the folder name |
| practiceItemId | text? FK → PracticeItem | nullable (unlabelled) |
| title | text? | optional user rename, ≤ 80 chars |
| recordedAt | text | start of recording |
| durationMs | int | 5,000–300,000 for analysis (FR-004). Shorter takes are kept but not analysed (status `too_short`) |
| cameraPosition | enum `front` \| `back` | |
| targetTempoBpm | int? | 30–300, optional goal entered by the user (FR-003), used for comparison only |
| accompanimentSetting | enum `auto` \| `on` \| `off` | default `auto` (FR-024). Changing it on the feedback screen triggers re-analysis (FR-029) |
| handednessAtRecording | enum | copy of the profile value, so a later profile change doesn't re-interpret old takes |
| skillLevelAtRecording | enum | copy, for the same reason |
| videoPath | text | relative path inside app storage |
| landmarksPath | text? | null if the live landmark stream was missing → post-take extraction fallback |
| fileSizeBytes | int | video plus side files, for FR-017 |
| captureStatus | enum | see state machine |
| analysisStatus | enum | see state machine |
| saved | bool | `false` = draft (not yet saved or discarded) |
| interrupted | bool | recording ended abnormally (call, app backgrounded, power loss) |
| createdAt / updatedAt | text | |

**Validation**
- `saved = true` requires `captureStatus = complete` or `interrupted = true`.

### Take state machine

```text
captureStatus:   recording ──stop──► complete
                     │
                     └─interrupt/crash─► partial      (interrupted = true)

analysisStatus:  pending ──start──► analysing ──ok──────────► analysed
                                       │      ├─no playing──► no_playing   (FR-012, edge case)
                                       │      └─error───────► failed       (retry allowed)
                                       └─app killed─► pending (recovered on next start)
                 (durationMs < 5,000) ─────────────► too_short

saved:           false (draft) ──Save──► true
                 false (draft) ──Discard──► row and folder deleted (nothing stored, Story 2 scenario 4)
                 true ──Delete (confirmed)──► row, report, points and folder deleted (Story 2 scenario 3)
```

**Draft cleanup**: on app start, drafts with `interrupted = true` go to the "Recovered takes" prompt. Any other draft older than 24 h is deleted.

## FeedbackReport

One per analysed take (FR-006 – FR-012). Re-analysis replaces the report.

| Field | Type | Rules |
|---|---|---|
| id | text PK | |
| takeId | text FK → Take, unique | cascade delete |
| analysisVersion | text | engine and threshold version, e.g. `1.0.0+t3` |
| timingScore | int? | 0–100; null = not enough data |
| techniqueScore | int? | 0–100; null = not enough data |
| summary | text | one line, ≤ 140 chars |
| detectedTempoBpm | real? | tempo estimated from the player's playing, used for the beat grid |
| targetTempoDeltaBpm | real? | detected − target, when a target tempo was entered |
| accompanimentKind | enum `none` \| `loop` \| `backing` \| `click` | what was detected (or assumed when the setting is `on`) (FR-025) |
| loopLengthMs | int? | set when `accompanimentKind = loop` |
| timingReference | enum `own_playing` \| `accompaniment` | which beat grid timing was measured against (FR-026) |
| separationConfidence | enum? `good` \| `partial` \| `poor` | null when `accompanimentKind = none` (FR-028) |
| liveOnsetMatchRate | real? | 0–1, share of live onsets matched to picking-hand strokes (research R16), for diagnostics and evaluation |
| tempoDriftBpm | real? | max − min local tempo |
| meanAbsOffsetMs | real? | |
| analysedCoverage | json | fraction of the take analysed for each aspect: `{ audio, frettingHand, pickingHand, posture }` (0–1) |
| limitations | json | list of `{ code, message, fromMs?, toMs? }`, e.g. `hands_not_visible`, `noisy_audio`, `posture_not_assessed` (FR-012) |
| processingMs | int | for SC-002 monitoring |
| createdAt | text | |

## FeedbackPoint

| Field | Type | Rules |
|---|---|---|
| id | text PK | |
| reportId | text FK → FeedbackReport | cascade delete |
| category | enum `timing` \| `technique` | |
| aspect | enum `tempo` \| `rhythm` \| `fretting_hand` \| `picking_hand` \| `clarity` \| `posture` | |
| issueCode | text | stable code from the [analysis-engine contract](./contracts/analysis-engine.md#issue-codes), used for recurring-issue grouping |
| severity | enum `info` \| `minor` \| `moderate` \| `major` | |
| confidence | real | 0–1. Points below the engine threshold are never stored |
| startMs | int | time in the take that playback seeks to (FR-013) |
| endMs | int? | |
| observation | text | rendered text, e.g. "You rushed beat 4 by about 40 ms in bars 3–6." |
| suggestion | text | rendered text, e.g. "Count the '&' of 3 out loud…" |
| metrics | json | the numbers behind the text, e.g. `{ meanOffsetMs: -41, beat: 4, count: 7 }` |
| sortOrder | int | most severe first |

**Validation**
- Every report that is not `no_playing` has at least one timing point and at least one technique point, or a `limitations` entry explaining why it doesn't (Story 1 scenario 1, FR-012).
- `startMs` must be within `[0, take.durationMs]`.

## RecurringIssue (derived, not stored)

A recurring issue is computed by query for a practice item (or for all items) over the **last N saved, analysed takes** (default N = 10) (FR-021).

| Field | Derivation |
|---|---|
| issueCode | group key |
| occurrences | number of takes in the window containing ≥ 1 point with this code |
| windowSize | number of takes considered |
| firstSeenAt / lastSeenAt | min/max `Take.recordedAt` |
| typicalSeverity | most common severity |
| displayText | from the issue-code catalogue, e.g. "Rushing on beat 4 in 6 of your last 8 takes" |

**Rule**: an issue is "recurring" when `occurrences ≥ 3` and `occurrences / windowSize ≥ 0.4`.

## Progress aggregates (derived)

- **Score series** (FR-020): `(recordedAt, timingScore, techniqueScore)` for saved, analysed takes, per item or overall. Null scores are left out of the line but shown as gaps.
  - Optional filter (FR-030): `all` | `solo` (`accompanimentKind = none`) | `accompanied` (any other kind). Points are marked by kind so solo and accompanied takes can be told apart on a shared chart.
- **Trend shown** when ≥ 2 data points exist. Otherwise show the "need more takes" message (Story 3 scenario 4).
- **Practice stats** (FR-023):
  - take count
  - total `durationMs` of saved takes
  - distinct local calendar days with ≥ 1 saved take, for each ISO week

## Indexes

- `Take(saved, recordedAt DESC)`: library list (Story 2 scenario 2).
- `Take(practiceItemId, recordedAt)`: per-item progress.
- `FeedbackPoint(issueCode, reportId)`: recurrence query.
- `FeedbackReport(takeId)` unique.
- `FeedbackReport(accompanimentKind)`: solo/accompanied progress filter.

## File layout

```text
<documents>/takes/<takeId>/
  video.mp4          # the recording (VisionCamera output; .mov on iOS is accepted)
  landmarks.jsonl    # one line per processed frame: { t, hands: [{ side, score, pts: [[x,y,z]×21] }] }
  thumb.jpg          # library thumbnail
<cache>/analysis/<takeId>.f32   # decoded mono PCM, deleted after analysis
```

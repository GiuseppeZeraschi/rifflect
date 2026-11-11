# Contract: Screens & Navigation (`app/`, expo-router)

These are the user-facing interfaces. Maestro end-to-end flows and component tests use the route paths and `testID`s below.

| Route | Screen | Story / FR | Key elements (`testID`) |
|---|---|---|---|
| `/onboarding` | Welcome → permissions explainer → handedness → skill level | FR-005, edge case "permission denied" | `onboarding-handedness-left/right`, `onboarding-skill-*`, `permission-open-settings` |
| `/(tabs)/record` | Camera preview, framing checklist, optional target tempo, accompaniment setting, record button | Story 1, Story 4, FR-001–004, FR-024 | `framing-status` (`ok` \| `hands_missing` \| `fretting_out_of_frame` \| `low_light`), `tempo-input`, `accompaniment-setting` (`auto` \| `on` \| `off`), `record-button`, `storage-warning` |
| `/take/[id]/analysing` | Progress while analysis runs; user may leave | FR-006, R13 | `analysis-progress`, `analysis-leave` |
| `/take/[id]` | Video player, scores, summary, accompaniment banner, feedback points, limitations, Save / Discard / Label | Story 1, Story 2, Story 4, FR-009–013, 015, 025, 028–029 | `score-timing`, `score-technique`, `accompaniment-banner` (kind, loop length, separation confidence), `reanalyse-as-solo` / `reanalyse-with-accompaniment`, `feedback-point-<i>` (tap → seek), `limitations`, `save-take`, `discard-take`, `label-picker` |
| `/(tabs)/library` | Saved takes, newest first; search by label; storage used | Story 2, FR-016–017 | `library-item-<id>`, `library-search`, `storage-used` |
| `/take/[id]/edit` | Rename / relabel / delete (confirm) / export / share | FR-016, 019 | `delete-take`, `confirm-delete`, `export-to-photos`, `share-take` |
| `/(tabs)/progress` | Overall and per-item score charts, recurring issues, practice stats, solo/accompanied filter | Story 3, FR-020–021, 023, 030 | `progress-item-picker`, `progress-accompaniment-filter`, `chart-scores`, `recurring-issue-<code>`, `need-more-takes`, `stats-*` |
| `/compare?a=<id>&b=<id>` | Two takes side by side (videos + feedback) | Story 3 scenario 3, FR-022 | `compare-a`, `compare-b` |
| `/(tabs)/settings` | Profile (handedness, skill level, camera), storage | FR-005, FR-017 | `settings-handedness`, `settings-skill`, `storage-used` |
| `/recover` | Interrupted takes found at start-up: analyse or discard | Edge case "interrupted" | `recover-analyse-<id>`, `recover-discard-<id>` |

**Navigation rules**
- **First launch** always routes to `/onboarding` until a `PlayerProfile` exists.
- **After stopping a recording**: go to `/take/[id]/analysing`, then on completion replace it with `/take/[id]`.
- **Draft takes** (unsaved) never appear in the library or progress views.
- **Leaving an unsaved draft**: leaving `/take/[id]` for a draft prompts Save / Discard / Keep for now.
- **Re-analysis**: `reanalyse-*` on `/take/[id]` updates `Take.accompanimentSetting`, then routes to `/take/[id]/analysing`, and returns to `/take/[id]` with the replaced report (FR-029).
- **Default setting**: the Record screen remembers the last accompaniment setting used (default `auto`).

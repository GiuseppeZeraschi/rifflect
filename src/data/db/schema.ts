/**
 * SQLite schema (Drizzle) — see specs/001-guitar-practice-feedback/data-model.md.
 *
 * Conventions: UUID v7 text primary keys, ISO-8601 UTC text timestamps, enums stored as text with
 * TypeScript unions, JSON stored as text (`mode: 'json'`). Value-range rules that SQLite can express
 * are CHECK constraints; the rest are enforced in the repositories.
 */
import { sql } from 'drizzle-orm';
import { check, index, integer, real, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

// ---- Enums ----------------------------------------------------------------------------------

export const HANDEDNESS = ['right', 'left'] as const;
export const SKILL_LEVELS = ['beginner', 'intermediate', 'advanced'] as const;
export const CAMERA_POSITIONS = ['front', 'back'] as const;
export const ACCOMPANIMENT_SETTINGS = ['auto', 'on', 'off'] as const;
export const CAPTURE_STATUSES = ['recording', 'complete', 'partial'] as const;
export const ANALYSIS_STATUSES = [
  'pending',
  'analysing',
  'analysed',
  'failed',
  'no_playing',
  'too_short',
] as const;
export const ACCOMPANIMENT_KINDS = ['none', 'loop', 'backing', 'click'] as const;
export const TIMING_REFERENCES = ['own_playing', 'accompaniment'] as const;
export const SEPARATION_CONFIDENCES = ['good', 'partial', 'poor'] as const;
export const FEEDBACK_CATEGORIES = ['timing', 'technique'] as const;
export const FEEDBACK_ASPECTS = [
  'tempo',
  'rhythm',
  'fretting_hand',
  'picking_hand',
  'clarity',
  'posture',
] as const;
export const SEVERITIES = ['info', 'minor', 'moderate', 'major'] as const;

export type Handedness = (typeof HANDEDNESS)[number];
export type SkillLevel = (typeof SKILL_LEVELS)[number];
export type CameraPosition = (typeof CAMERA_POSITIONS)[number];
export type AccompanimentSetting = (typeof ACCOMPANIMENT_SETTINGS)[number];
export type CaptureStatus = (typeof CAPTURE_STATUSES)[number];
export type AnalysisStatus = (typeof ANALYSIS_STATUSES)[number];
export type AccompanimentKind = (typeof ACCOMPANIMENT_KINDS)[number];
export type TimingReference = (typeof TIMING_REFERENCES)[number];
export type SeparationConfidence = (typeof SEPARATION_CONFIDENCES)[number];
export type FeedbackCategory = (typeof FEEDBACK_CATEGORIES)[number];
export type FeedbackAspect = (typeof FEEDBACK_ASPECTS)[number];
export type Severity = (typeof SEVERITIES)[number];

/** `col IN ('a','b')` for CHECK constraints. Values are compile-time constants, never user input. */
function inList(column: string, values: readonly string[]) {
  return sql.raw(`${column} IN (${values.map((v) => `'${v}'`).join(', ')})`);
}

// ---- player_profile -------------------------------------------------------------------------

export const playerProfile = sqliteTable(
  'player_profile',
  {
    /** always "me" */
    id: text('id').primaryKey(),
    handedness: text('handedness', { enum: HANDEDNESS }).notNull(),
    skillLevel: text('skill_level', { enum: SKILL_LEVELS }).notNull(),
    preferredCamera: text('preferred_camera', { enum: CAMERA_POSITIONS }).notNull().default('front'),
    lastAccompanimentSetting: text('last_accompaniment_setting', { enum: ACCOMPANIMENT_SETTINGS })
      .notNull()
      .default('auto'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  () => [
    check('player_profile_id_me', sql`id = 'me'`),
    check('player_profile_handedness', inList('handedness', HANDEDNESS)),
    check('player_profile_skill', inList('skill_level', SKILL_LEVELS)),
    check('player_profile_camera', inList('preferred_camera', CAMERA_POSITIONS)),
    check('player_profile_accompaniment', inList('last_accompaniment_setting', ACCOMPANIMENT_SETTINGS)),
  ],
);

// ---- practice_item --------------------------------------------------------------------------

export const practiceItem = sqliteTable(
  'practice_item',
  {
    id: text('id').primaryKey(),
    /** 1–60 chars, trimmed, unique ignoring case */
    name: text('name').notNull(),
    createdAt: text('created_at').notNull(),
    lastUsedAt: text('last_used_at'),
  },
  (t) => [
    uniqueIndex('practice_item_name_nocase').on(sql`lower(${t.name})`),
    check('practice_item_name_len', sql`length(name) BETWEEN 1 AND 60 AND name = trim(name)`),
  ],
);

// ---- take -----------------------------------------------------------------------------------

export const take = sqliteTable(
  'take',
  {
    id: text('id').primaryKey(),
    practiceItemId: text('practice_item_id').references(() => practiceItem.id, {
      onDelete: 'set null',
    }),
    /** optional user rename, ≤ 80 chars */
    title: text('title'),
    recordedAt: text('recorded_at').notNull(),
    durationMs: integer('duration_ms').notNull().default(0),
    cameraPosition: text('camera_position', { enum: CAMERA_POSITIONS }).notNull(),
    /** 30–300, optional goal entered by the user; comparison only */
    targetTempoBpm: integer('target_tempo_bpm'),
    accompanimentSetting: text('accompaniment_setting', { enum: ACCOMPANIMENT_SETTINGS })
      .notNull()
      .default('auto'),
    handednessAtRecording: text('handedness_at_recording', { enum: HANDEDNESS }).notNull(),
    skillLevelAtRecording: text('skill_level_at_recording', { enum: SKILL_LEVELS }).notNull(),
    /** relative to the documents directory */
    videoPath: text('video_path').notNull(),
    landmarksPath: text('landmarks_path'),
    fileSizeBytes: integer('file_size_bytes').notNull().default(0),
    captureStatus: text('capture_status', { enum: CAPTURE_STATUSES }).notNull(),
    analysisStatus: text('analysis_status', { enum: ANALYSIS_STATUSES }).notNull(),
    saved: integer('saved', { mode: 'boolean' }).notNull().default(false),
    interrupted: integer('interrupted', { mode: 'boolean' }).notNull().default(false),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (t) => [
    index('take_saved_recorded').on(t.saved, t.recordedAt),
    index('take_item_recorded').on(t.practiceItemId, t.recordedAt),
    check('take_title_len', sql`title IS NULL OR length(title) <= 80`),
    check('take_duration', sql`duration_ms >= 0 AND duration_ms <= 300000`),
    check('take_target_tempo', sql`target_tempo_bpm IS NULL OR target_tempo_bpm BETWEEN 30 AND 300`),
    check('take_camera', inList('camera_position', CAMERA_POSITIONS)),
    check('take_accompaniment', inList('accompaniment_setting', ACCOMPANIMENT_SETTINGS)),
    check('take_handedness', inList('handedness_at_recording', HANDEDNESS)),
    check('take_skill', inList('skill_level_at_recording', SKILL_LEVELS)),
    check('take_capture_status', inList('capture_status', CAPTURE_STATUSES)),
    check('take_analysis_status', inList('analysis_status', ANALYSIS_STATUSES)),
    // "saved = true requires captureStatus = complete or interrupted = true"
    check('take_saved_rule', sql`saved = 0 OR capture_status = 'complete' OR interrupted = 1`),
  ],
);

// ---- feedback_report ------------------------------------------------------------------------

export type LimitationRow = { code: string; message: string; fromMs?: number; toMs?: number };
export type CoverageRow = { audio: number; frettingHand: number; pickingHand: number; posture: number };

export const feedbackReport = sqliteTable(
  'feedback_report',
  {
    id: text('id').primaryKey(),
    takeId: text('take_id')
      .notNull()
      .references(() => take.id, { onDelete: 'cascade' }),
    analysisVersion: text('analysis_version').notNull(),
    /** 0–100; null = not enough data */
    timingScore: integer('timing_score'),
    /** 0–100; null = not enough data */
    techniqueScore: integer('technique_score'),
    /** one line, ≤ 140 chars */
    summary: text('summary').notNull(),
    detectedTempoBpm: real('detected_tempo_bpm'),
    targetTempoDeltaBpm: real('target_tempo_delta_bpm'),
    tempoDriftBpm: real('tempo_drift_bpm'),
    meanAbsOffsetMs: real('mean_abs_offset_ms'),
    accompanimentKind: text('accompaniment_kind', { enum: ACCOMPANIMENT_KINDS })
      .notNull()
      .default('none'),
    loopLengthMs: integer('loop_length_ms'),
    timingReference: text('timing_reference', { enum: TIMING_REFERENCES })
      .notNull()
      .default('own_playing'),
    separationConfidence: text('separation_confidence', { enum: SEPARATION_CONFIDENCES }),
    liveOnsetMatchRate: real('live_onset_match_rate'),
    analysedCoverage: text('analysed_coverage', { mode: 'json' }).$type<CoverageRow>().notNull(),
    limitations: text('limitations', { mode: 'json' }).$type<LimitationRow[]>().notNull(),
    processingMs: integer('processing_ms').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (t) => [
    uniqueIndex('feedback_report_take').on(t.takeId),
    index('feedback_report_accompaniment').on(t.accompanimentKind),
    check('report_timing_score', sql`timing_score IS NULL OR timing_score BETWEEN 0 AND 100`),
    check('report_technique_score', sql`technique_score IS NULL OR technique_score BETWEEN 0 AND 100`),
    check('report_summary_len', sql`length(summary) <= 140`),
    check('report_accompaniment_kind', inList('accompaniment_kind', ACCOMPANIMENT_KINDS)),
    check('report_timing_reference', inList('timing_reference', TIMING_REFERENCES)),
    check(
      'report_separation',
      sql`separation_confidence IS NULL OR separation_confidence IN ('good', 'partial', 'poor')`,
    ),
    check(
      'report_match_rate',
      sql`live_onset_match_rate IS NULL OR live_onset_match_rate BETWEEN 0 AND 1`,
    ),
  ],
);

// ---- feedback_point -------------------------------------------------------------------------

export const feedbackPoint = sqliteTable(
  'feedback_point',
  {
    id: text('id').primaryKey(),
    reportId: text('report_id')
      .notNull()
      .references(() => feedbackReport.id, { onDelete: 'cascade' }),
    category: text('category', { enum: FEEDBACK_CATEGORIES }).notNull(),
    aspect: text('aspect', { enum: FEEDBACK_ASPECTS }).notNull(),
    issueCode: text('issue_code').notNull(),
    severity: text('severity', { enum: SEVERITIES }).notNull(),
    /** 0–1 */
    confidence: real('confidence').notNull(),
    startMs: integer('start_ms').notNull(),
    endMs: integer('end_ms'),
    observation: text('observation').notNull(),
    suggestion: text('suggestion').notNull(),
    metrics: text('metrics', { mode: 'json' }).$type<Record<string, number | string>>().notNull(),
    sortOrder: integer('sort_order').notNull(),
  },
  (t) => [
    index('feedback_point_issue').on(t.issueCode, t.reportId),
    index('feedback_point_report').on(t.reportId, t.sortOrder),
    check('point_category', inList('category', FEEDBACK_CATEGORIES)),
    check('point_aspect', inList('aspect', FEEDBACK_ASPECTS)),
    check('point_severity', inList('severity', SEVERITIES)),
    check('point_confidence', sql`confidence BETWEEN 0 AND 1`),
    check('point_start', sql`start_ms >= 0`),
  ],
);

export type PlayerProfileRow = typeof playerProfile.$inferSelect;
export type PracticeItemRow = typeof practiceItem.$inferSelect;
export type TakeRow = typeof take.$inferSelect;
export type NewTakeRow = typeof take.$inferInsert;
export type FeedbackReportRow = typeof feedbackReport.$inferSelect;
export type FeedbackPointRow = typeof feedbackPoint.$inferSelect;

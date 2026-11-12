CREATE TABLE `feedback_point` (
	`id` text PRIMARY KEY NOT NULL,
	`report_id` text NOT NULL,
	`category` text NOT NULL,
	`aspect` text NOT NULL,
	`issue_code` text NOT NULL,
	`severity` text NOT NULL,
	`confidence` real NOT NULL,
	`start_ms` integer NOT NULL,
	`end_ms` integer,
	`observation` text NOT NULL,
	`suggestion` text NOT NULL,
	`metrics` text NOT NULL,
	`sort_order` integer NOT NULL,
	FOREIGN KEY (`report_id`) REFERENCES `feedback_report`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "point_category" CHECK(category IN ('timing', 'technique')),
	CONSTRAINT "point_aspect" CHECK(aspect IN ('tempo', 'rhythm', 'fretting_hand', 'picking_hand', 'clarity', 'posture')),
	CONSTRAINT "point_severity" CHECK(severity IN ('info', 'minor', 'moderate', 'major')),
	CONSTRAINT "point_confidence" CHECK(confidence BETWEEN 0 AND 1),
	CONSTRAINT "point_start" CHECK(start_ms >= 0)
);
--> statement-breakpoint
CREATE INDEX `feedback_point_issue` ON `feedback_point` (`issue_code`,`report_id`);--> statement-breakpoint
CREATE INDEX `feedback_point_report` ON `feedback_point` (`report_id`,`sort_order`);--> statement-breakpoint
CREATE TABLE `feedback_report` (
	`id` text PRIMARY KEY NOT NULL,
	`take_id` text NOT NULL,
	`analysis_version` text NOT NULL,
	`timing_score` integer,
	`technique_score` integer,
	`summary` text NOT NULL,
	`detected_tempo_bpm` real,
	`target_tempo_delta_bpm` real,
	`tempo_drift_bpm` real,
	`mean_abs_offset_ms` real,
	`accompaniment_kind` text DEFAULT 'none' NOT NULL,
	`loop_length_ms` integer,
	`timing_reference` text DEFAULT 'own_playing' NOT NULL,
	`separation_confidence` text,
	`live_onset_match_rate` real,
	`analysed_coverage` text NOT NULL,
	`limitations` text NOT NULL,
	`processing_ms` integer NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`take_id`) REFERENCES `take`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "report_timing_score" CHECK(timing_score IS NULL OR timing_score BETWEEN 0 AND 100),
	CONSTRAINT "report_technique_score" CHECK(technique_score IS NULL OR technique_score BETWEEN 0 AND 100),
	CONSTRAINT "report_summary_len" CHECK(length(summary) <= 140),
	CONSTRAINT "report_accompaniment_kind" CHECK(accompaniment_kind IN ('none', 'loop', 'backing', 'click')),
	CONSTRAINT "report_timing_reference" CHECK(timing_reference IN ('own_playing', 'accompaniment')),
	CONSTRAINT "report_separation" CHECK(separation_confidence IS NULL OR separation_confidence IN ('good', 'partial', 'poor')),
	CONSTRAINT "report_match_rate" CHECK(live_onset_match_rate IS NULL OR live_onset_match_rate BETWEEN 0 AND 1)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `feedback_report_take` ON `feedback_report` (`take_id`);--> statement-breakpoint
CREATE INDEX `feedback_report_accompaniment` ON `feedback_report` (`accompaniment_kind`);--> statement-breakpoint
CREATE TABLE `player_profile` (
	`id` text PRIMARY KEY NOT NULL,
	`handedness` text NOT NULL,
	`skill_level` text NOT NULL,
	`preferred_camera` text DEFAULT 'front' NOT NULL,
	`last_accompaniment_setting` text DEFAULT 'auto' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	CONSTRAINT "player_profile_id_me" CHECK(id = 'me'),
	CONSTRAINT "player_profile_handedness" CHECK(handedness IN ('right', 'left')),
	CONSTRAINT "player_profile_skill" CHECK(skill_level IN ('beginner', 'intermediate', 'advanced')),
	CONSTRAINT "player_profile_camera" CHECK(preferred_camera IN ('front', 'back')),
	CONSTRAINT "player_profile_accompaniment" CHECK(last_accompaniment_setting IN ('auto', 'on', 'off'))
);
--> statement-breakpoint
CREATE TABLE `practice_item` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`created_at` text NOT NULL,
	`last_used_at` text,
	CONSTRAINT "practice_item_name_len" CHECK(length(name) BETWEEN 1 AND 60 AND name = trim(name))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `practice_item_name_nocase` ON `practice_item` (lower("name"));--> statement-breakpoint
CREATE TABLE `take` (
	`id` text PRIMARY KEY NOT NULL,
	`practice_item_id` text,
	`title` text,
	`recorded_at` text NOT NULL,
	`duration_ms` integer DEFAULT 0 NOT NULL,
	`camera_position` text NOT NULL,
	`target_tempo_bpm` integer,
	`accompaniment_setting` text DEFAULT 'auto' NOT NULL,
	`handedness_at_recording` text NOT NULL,
	`skill_level_at_recording` text NOT NULL,
	`video_path` text NOT NULL,
	`landmarks_path` text,
	`file_size_bytes` integer DEFAULT 0 NOT NULL,
	`capture_status` text NOT NULL,
	`analysis_status` text NOT NULL,
	`saved` integer DEFAULT false NOT NULL,
	`interrupted` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`practice_item_id`) REFERENCES `practice_item`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "take_title_len" CHECK(title IS NULL OR length(title) <= 80),
	CONSTRAINT "take_duration" CHECK(duration_ms >= 0 AND duration_ms <= 300000),
	CONSTRAINT "take_target_tempo" CHECK(target_tempo_bpm IS NULL OR target_tempo_bpm BETWEEN 30 AND 300),
	CONSTRAINT "take_camera" CHECK(camera_position IN ('front', 'back')),
	CONSTRAINT "take_accompaniment" CHECK(accompaniment_setting IN ('auto', 'on', 'off')),
	CONSTRAINT "take_handedness" CHECK(handedness_at_recording IN ('right', 'left')),
	CONSTRAINT "take_skill" CHECK(skill_level_at_recording IN ('beginner', 'intermediate', 'advanced')),
	CONSTRAINT "take_capture_status" CHECK(capture_status IN ('recording', 'complete', 'partial')),
	CONSTRAINT "take_analysis_status" CHECK(analysis_status IN ('pending', 'analysing', 'analysed', 'failed', 'no_playing', 'too_short')),
	CONSTRAINT "take_saved_rule" CHECK(saved = 0 OR capture_status = 'complete' OR interrupted = 1)
);
--> statement-breakpoint
CREATE INDEX `take_saved_recorded` ON `take` (`saved`,`recorded_at`);--> statement-breakpoint
CREATE INDEX `take_item_recorded` ON `take` (`practice_item_id`,`recorded_at`);
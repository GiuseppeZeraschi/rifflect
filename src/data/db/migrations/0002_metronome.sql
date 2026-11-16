ALTER TABLE `player_profile` ADD `last_metronome_on` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `take` ADD `metronome_bpm` integer;
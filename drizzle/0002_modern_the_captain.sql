CREATE TABLE `guest_sessions` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`display_name` text NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `guest_sessions_user` ON `guest_sessions` (`user_id`);--> statement-breakpoint
CREATE INDEX `guest_sessions_expiry` ON `guest_sessions` (`expires_at`);--> statement-breakpoint
ALTER TABLE `players` ADD `participant_type` text DEFAULT 'account' NOT NULL;
CREATE TABLE `answers` (
	`id` text PRIMARY KEY NOT NULL,
	`room_code` text NOT NULL,
	`user_id` text NOT NULL,
	`question_index` integer NOT NULL,
	`selected` integer NOT NULL,
	`is_correct` integer NOT NULL,
	`points` integer NOT NULL,
	`elapsed_ms` integer NOT NULL,
	`submitted_at` text NOT NULL,
	FOREIGN KEY (`room_code`) REFERENCES `rooms`(`code`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `answers_room_user_question` ON `answers` (`room_code`,`user_id`,`question_index`);--> statement-breakpoint
CREATE TABLE `players` (
	`id` text PRIMARY KEY NOT NULL,
	`room_code` text NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`joined_at` text NOT NULL,
	FOREIGN KEY (`room_code`) REFERENCES `rooms`(`code`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `players_room_user` ON `players` (`room_code`,`user_id`);--> statement-breakpoint
CREATE TABLE `rooms` (
	`code` text PRIMARY KEY NOT NULL,
	`host_id` text NOT NULL,
	`title` text NOT NULL,
	`snapshot` text NOT NULL,
	`phase` text NOT NULL,
	`question_index` integer NOT NULL,
	`started_at` integer,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `rooms_host_created` ON `rooms` (`host_id`,`created_at`);
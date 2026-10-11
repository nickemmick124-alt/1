CREATE TABLE `host_access` (
	`email` text PRIMARY KEY NOT NULL,
	`display_name` text NOT NULL,
	`granted_by` text NOT NULL,
	`granted_at` text NOT NULL
);

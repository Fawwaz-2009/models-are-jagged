CREATE TABLE `creators` (
	`user_id` text PRIMARY KEY,
	`handle` text NOT NULL UNIQUE,
	`display_name` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `publications` (
	`id` text PRIMARY KEY,
	`user_id` text NOT NULL,
	`client_id` text NOT NULL,
	`handle` text NOT NULL,
	`display_name` text NOT NULL,
	`title` text NOT NULL,
	`brief` text NOT NULL,
	`mode` text NOT NULL,
	`medium` text NOT NULL,
	`tags` text DEFAULT '[]' NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `published_artifacts` (
	`id` text PRIMARY KEY,
	`publication_id` text NOT NULL,
	`prompt` text NOT NULL,
	`prompt_source` text NOT NULL,
	`llm_id` text,
	`model_id` text NOT NULL,
	`media_type` text NOT NULL,
	`mime` text NOT NULL,
	`asset_key` text NOT NULL,
	`width` integer,
	`height` integer,
	`seed` integer,
	`cost_usd` text,
	`latency_ms` integer,
	`sort` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
DROP INDEX IF EXISTS `notes_user_id_idx`;--> statement-breakpoint
CREATE INDEX `publications_user_id_idx` ON `publications` (`user_id`);--> statement-breakpoint
CREATE INDEX `publications_handle_idx` ON `publications` (`handle`);--> statement-breakpoint
CREATE INDEX `publications_created_at_idx` ON `publications` (`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `publications_user_client_idx` ON `publications` (`user_id`,`client_id`);--> statement-breakpoint
CREATE INDEX `published_artifacts_publication_idx` ON `published_artifacts` (`publication_id`);--> statement-breakpoint
DROP TABLE `notes`;
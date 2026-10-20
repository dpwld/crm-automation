CREATE TABLE `crm_actions` (
	`owner` text NOT NULL,
	`entity` text NOT NULL,
	`record_id` text NOT NULL,
	`action` text NOT NULL,
	`created_at` text NOT NULL,
	PRIMARY KEY(`owner`, `entity`, `record_id`, `action`)
);
--> statement-breakpoint
CREATE TABLE `crm_counters` (
	`owner` text NOT NULL,
	`scope` text NOT NULL,
	`year` integer NOT NULL,
	`value` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`owner`, `scope`, `year`)
);
--> statement-breakpoint
CREATE TABLE `crm_files` (
	`owner` text NOT NULL,
	`bucket` text NOT NULL,
	`path` text NOT NULL,
	`object_key` text NOT NULL,
	`content_type` text NOT NULL,
	`size` integer NOT NULL,
	PRIMARY KEY(`owner`, `bucket`, `path`)
);
--> statement-breakpoint
CREATE TABLE `crm_links` (
	`hash` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`entity` text NOT NULL,
	`record_id` text NOT NULL,
	`expires_at` text NOT NULL,
	`revoked` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE `crm_records` (
	`owner` text NOT NULL,
	`entity` text NOT NULL,
	`id` text NOT NULL,
	`payload` text NOT NULL,
	`unique_key` text,
	`secondary_key` text,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`owner`, `entity`, `id`)
);
--> statement-breakpoint
CREATE INDEX `crm_owner_entity` ON `crm_records` (`owner`,`entity`);--> statement-breakpoint
CREATE UNIQUE INDEX `crm_unique_key` ON `crm_records` (`owner`,`entity`,`unique_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `crm_secondary_key` ON `crm_records` (`owner`,`entity`,`secondary_key`);--> statement-breakpoint
CREATE TABLE `integration_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`action` text NOT NULL,
	`status` text NOT NULL,
	`detail` text NOT NULL,
	`created_at` text NOT NULL
);

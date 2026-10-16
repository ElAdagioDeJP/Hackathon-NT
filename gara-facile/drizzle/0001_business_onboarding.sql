-- SQLite table rebuilds must defer foreign keys inside Drizzle's transaction.
PRAGMA defer_foreign_keys=ON;--> statement-breakpoint
-- Drop the dependent view before rebuilding its source tables.
DROP VIEW `whole_business_records`;--> statement-breakpoint
CREATE TABLE `business_documents` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`business_record_id` integer NOT NULL,
	`category` text NOT NULL,
	`original_name` text NOT NULL,
	`mime_type` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`storage_key` text NOT NULL,
	`extracted_text` text,
	`processing_status` text DEFAULT 'pending' NOT NULL,
	`expires_at` integer,
	`uploaded_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`business_record_id`) REFERENCES `business_records`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `business_documents_storage_key_unique` ON `business_documents` (`storage_key`);--> statement-breakpoint
CREATE INDEX `business_documents_record_idx` ON `business_documents` (`business_record_id`);--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_businesses` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`email` text,
	`phone` text,
	`country` text NOT NULL,
	`city` text NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_businesses`("id", "name", "email", "phone", "country", "city") SELECT "id", "name", "email", "phone", "country", "city" FROM `businesses`;--> statement-breakpoint
DROP TABLE `businesses`;--> statement-breakpoint
ALTER TABLE `__new_businesses` RENAME TO `businesses`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE TABLE `__new_submissions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`contract_match_id` integer NOT NULL,
	`content` blob NOT NULL,
	`created_at` integer DEFAULT (unixepoch()),
	FOREIGN KEY (`contract_match_id`) REFERENCES `contract_matches`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_submissions`("id", "contract_match_id", "content", "created_at") SELECT "id", "contract_match_id", "content", "created_at" FROM `submissions`;--> statement-breakpoint
DROP TABLE `submissions`;--> statement-breakpoint
ALTER TABLE `__new_submissions` RENAME TO `submissions`;--> statement-breakpoint
-- ALTER ADD COLUMN cannot add a nonconstant timestamp default to a populated
-- SQLite table. Rebuild it so existing rows receive the new defaults too.
CREATE TABLE `__new_business_records` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`business_id` integer NOT NULL,
	`offerings` text,
	`coverage_scope` text,
	`coverage_countries` text DEFAULT '[]' NOT NULL,
	`capacity` text,
	`experience_level` text,
	`experience` text,
	`cpv_codes` text DEFAULT '[]' NOT NULL,
	`certifications` text DEFAULT '[]' NOT NULL,
	`languages` text DEFAULT '[]' NOT NULL,
	`context_summary` text,
	`status` text DEFAULT 'draft' NOT NULL,
	`approved_at` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON UPDATE no action ON DELETE no action
);--> statement-breakpoint
INSERT INTO `__new_business_records` ("id", "business_id") SELECT "id", "business_id" FROM `business_records`;--> statement-breakpoint
DROP TABLE `business_records`;--> statement-breakpoint
ALTER TABLE `__new_business_records` RENAME TO `business_records`;--> statement-breakpoint
CREATE VIEW `whole_business_records` AS select "businesses"."id", "businesses"."name", "businesses"."email", "businesses"."phone", "businesses"."country", "businesses"."city", "business_records"."id", "business_records"."business_id", "business_records"."offerings", "business_records"."coverage_scope", "business_records"."coverage_countries", "business_records"."capacity", "business_records"."experience_level", "business_records"."experience", "business_records"."cpv_codes", "business_records"."certifications", "business_records"."languages", "business_records"."context_summary", "business_records"."status", "business_records"."approved_at", "business_records"."created_at", "business_records"."updated_at" from "businesses" left join "business_records" on "businesses"."id" = "business_records"."business_id";
--> statement-breakpoint
-- Assert real FK consistency before resetting SQLite's deferred counters.
-- Dropping and restoring a referenced table otherwise leaves stale counters.
CREATE TEMP TABLE `__business_migration_fk_check` (`violations` integer CHECK (`violations` = 0));--> statement-breakpoint
INSERT INTO `__business_migration_fk_check` SELECT count(*) FROM pragma_foreign_key_check;--> statement-breakpoint
DROP TABLE `__business_migration_fk_check`;--> statement-breakpoint
PRAGMA defer_foreign_keys=OFF;

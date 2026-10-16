CREATE TABLE `business_records` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`business_id` integer NOT NULL,
	FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `businesses` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`phone` text NOT NULL,
	`country` text NOT NULL,
	`city` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `contract_matches` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`contract_id` text NOT NULL,
	`business_record_id` integer NOT NULL,
	`type` text DEFAULT 'none',
	`score` integer DEFAULT 0,
	FOREIGN KEY (`contract_id`) REFERENCES `contracts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`business_record_id`) REFERENCES `business_records`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `contracts` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`url` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `submissions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`contract_match_id` integer NOT NULL,
	`content` blob NOT NULL,
	`created_at` integer DEFAULT 1792186254,
	FOREIGN KEY (`contract_match_id`) REFERENCES `contract_matches`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE VIEW `whole_business_records` AS select "businesses"."id", "businesses"."name", "businesses"."email", "businesses"."phone", "businesses"."country", "businesses"."city", "business_records"."id", "business_records"."business_id" from "businesses" left join "business_records" on "businesses"."id" = "business_records"."business_id";
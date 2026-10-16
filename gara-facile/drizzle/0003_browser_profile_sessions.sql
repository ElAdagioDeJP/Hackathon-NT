CREATE TABLE `business_profile_sessions` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`business_record_id` integer NOT NULL,
	`expires_at` integer NOT NULL,
	FOREIGN KEY (`business_record_id`) REFERENCES `business_records`(`id`) ON UPDATE no action ON DELETE no action
);

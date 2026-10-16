ALTER TABLE `business_documents` ADD `storage_provider` text DEFAULT 'local' NOT NULL;--> statement-breakpoint
ALTER TABLE `business_documents` ADD `storage_bucket` text;
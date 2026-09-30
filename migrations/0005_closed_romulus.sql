CREATE TABLE `ingest_reports` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`kind` text NOT NULL,
	`source` text NOT NULL,
	`received_at` integer NOT NULL,
	`payload` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_ingest_reports_kind_received` ON `ingest_reports` (`kind`,`received_at`);
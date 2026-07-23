CREATE TABLE `daily_summaries` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`station_id` text NOT NULL,
	`date` text NOT NULL,
	`measurement_name` text NOT NULL,
	`unit` text NOT NULL,
	`min` real,
	`max` real,
	`avg` real,
	`count` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`station_id`) REFERENCES `stations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_daily_summaries_unique` ON `daily_summaries` (`station_id`,`date`,`measurement_name`);--> statement-breakpoint
CREATE INDEX `idx_daily_summaries_station_date` ON `daily_summaries` (`station_id`,`date`);--> statement-breakpoint
CREATE TABLE `records` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`station_id` text NOT NULL,
	`measurement_name` text NOT NULL,
	`unit` text NOT NULL,
	`scope` text NOT NULL,
	`scope_key` text NOT NULL,
	`record_type` text NOT NULL,
	`value` real NOT NULL,
	`date` text NOT NULL,
	FOREIGN KEY (`station_id`) REFERENCES `stations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_records_station_scope` ON `records` (`station_id`,`scope`);--> statement-breakpoint
CREATE INDEX `idx_records_station_measurement` ON `records` (`station_id`,`measurement_name`);
CREATE TABLE `archive_records` (
	`station_id` text NOT NULL,
	`sensor_id` text NOT NULL,
	`sensor_type` integer NOT NULL,
	`timestamp` integer NOT NULL,
	`interval_minutes` integer,
	`payload` text NOT NULL,
	`fetched_at` integer NOT NULL,
	PRIMARY KEY(`station_id`, `sensor_id`, `timestamp`),
	FOREIGN KEY (`station_id`) REFERENCES `stations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_archive_records_station_timestamp` ON `archive_records` (`station_id`,`timestamp`);
CREATE TABLE `observations` (
	`id` text PRIMARY KEY NOT NULL,
	`station_id` text NOT NULL,
	`sensor_id` text NOT NULL,
	`timestamp` integer NOT NULL,
	`received_at` integer NOT NULL,
	`source` text NOT NULL,
	`measurements` text NOT NULL,
	`raw_payload_hash` text NOT NULL,
	FOREIGN KEY (`station_id`) REFERENCES `stations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`sensor_id`) REFERENCES `sensors`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_observations_station_timestamp` ON `observations` (`station_id`,`timestamp`);--> statement-breakpoint
CREATE INDEX `idx_observations_timestamp` ON `observations` (`timestamp`);--> statement-breakpoint
CREATE TABLE `sensors` (
	`id` text PRIMARY KEY NOT NULL,
	`station_id` text NOT NULL,
	`lsid` integer NOT NULL,
	`sensor_type` integer NOT NULL,
	`data_structure_type` integer,
	`name` text NOT NULL,
	`category` text NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	FOREIGN KEY (`station_id`) REFERENCES `stations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `stations` (
	`id` text PRIMARY KEY NOT NULL,
	`weatherlink_station_id` text NOT NULL,
	`name` text NOT NULL,
	`timezone` text DEFAULT 'UTC' NOT NULL,
	`latitude` real,
	`longitude` real,
	`elevation_metres` real,
	`is_active` integer DEFAULT true NOT NULL,
	`registered_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);

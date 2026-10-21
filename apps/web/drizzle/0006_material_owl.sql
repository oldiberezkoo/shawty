CREATE TABLE `device_telemetry_samples` (
	`id` text PRIMARY KEY NOT NULL,
	`screen_id` text NOT NULL,
	`company_id` text NOT NULL,
	`at` integer NOT NULL,
	`ping_ms` integer,
	`downlink_kbps` integer,
	`network_rtt_ms` integer,
	`state_latency_ms` integer,
	`effective_type` text,
	FOREIGN KEY (`screen_id`) REFERENCES `screens`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `device_telemetry_screen_at_idx` ON `device_telemetry_samples` (`screen_id`,`at`);--> statement-breakpoint
CREATE INDEX `device_telemetry_at_idx` ON `device_telemetry_samples` (`at`);
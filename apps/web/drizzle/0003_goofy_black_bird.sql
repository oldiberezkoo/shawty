ALTER TABLE `release_targets` ADD `campaign_id` text REFERENCES campaigns(id);--> statement-breakpoint
CREATE INDEX `release_targets_campaign_idx` ON `release_targets` (`campaign_id`);
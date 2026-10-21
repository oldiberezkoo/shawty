ALTER TABLE `campaigns` ADD `playlist_version_id` text REFERENCES playlist_versions(id);--> statement-breakpoint
ALTER TABLE `campaigns` ADD `fallback_playlist_version_id` text REFERENCES playlist_versions(id);--> statement-breakpoint
ALTER TABLE `campaigns` ADD `timezone_override` text;--> statement-breakpoint
ALTER TABLE `screen_publications` ADD `playlist_version_id` text REFERENCES playlist_versions(id);
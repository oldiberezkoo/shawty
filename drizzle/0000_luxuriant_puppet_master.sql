CREATE TABLE `api_tokens` (
	`id` text PRIMARY KEY NOT NULL,
	`company_id` text NOT NULL,
	`name` text NOT NULL,
	`token_hash` text NOT NULL,
	`scopes_json` text,
	`created_by_user_id` text,
	`last_used_at` integer,
	`expires_at` integer,
	`revoked_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `api_tokens_hash_idx` ON `api_tokens` (`token_hash`);--> statement-breakpoint
CREATE TABLE `audit_log` (
	`id` text PRIMARY KEY NOT NULL,
	`company_id` text,
	`actor_user_id` text,
	`action` text NOT NULL,
	`target_type` text,
	`target_id` text,
	`meta_json` text,
	`ip` text,
	`at` integer NOT NULL,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `audit_log_company_at_idx` ON `audit_log` (`company_id`,`at`);--> statement-breakpoint
CREATE INDEX `audit_log_actor_idx` ON `audit_log` (`actor_user_id`,`at`);--> statement-breakpoint
CREATE TABLE `branches` (
	`id` text PRIMARY KEY NOT NULL,
	`company_id` text NOT NULL,
	`name` text NOT NULL,
	`code` text,
	`timezone` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `branches_company_idx` ON `branches` (`company_id`);--> statement-breakpoint
CREATE TABLE `campaign_targets` (
	`id` text PRIMARY KEY NOT NULL,
	`campaign_id` text NOT NULL,
	`scope_type` text NOT NULL,
	`scope_id` text NOT NULL,
	FOREIGN KEY (`campaign_id`) REFERENCES `campaigns`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `campaign_targets_idx` ON `campaign_targets` (`campaign_id`,`scope_type`,`scope_id`);--> statement-breakpoint
CREATE INDEX `campaign_targets_lookup_idx` ON `campaign_targets` (`scope_type`,`scope_id`);--> statement-breakpoint
CREATE TABLE `campaigns` (
	`id` text PRIMARY KEY NOT NULL,
	`company_id` text NOT NULL,
	`name` text NOT NULL,
	`kind` text DEFAULT 'internal' NOT NULL,
	`priority` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`starts_on` text NOT NULL,
	`ends_on` text,
	`approval_required` integer DEFAULT false NOT NULL,
	`created_by_user_id` text,
	`approved_by_user_id` text,
	`approved_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`approved_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `campaigns_company_status_idx` ON `campaigns` (`company_id`,`status`);--> statement-breakpoint
CREATE TABLE `companies` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`logo_asset_id` text,
	`timezone` text DEFAULT 'Asia/Tashkent' NOT NULL,
	`locale` text DEFAULT 'ru' NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `companies_slug_idx` ON `companies` (`slug`);--> statement-breakpoint
CREATE TABLE `delivery_receipts` (
	`id` text PRIMARY KEY NOT NULL,
	`release_id` text NOT NULL,
	`screen_id` text NOT NULL,
	`state` text DEFAULT 'queued' NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`sent_at` integer,
	`acked_at` integer,
	`error_code` text,
	`error_message` text,
	`player_version` text,
	`latency_ms` integer,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`release_id`) REFERENCES `releases`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`screen_id`) REFERENCES `screens`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `delivery_receipts_idx` ON `delivery_receipts` (`release_id`,`screen_id`);--> statement-breakpoint
CREATE INDEX `delivery_receipts_screen_state_idx` ON `delivery_receipts` (`screen_id`,`state`);--> statement-breakpoint
CREATE TABLE `device_credentials` (
	`id` text PRIMARY KEY NOT NULL,
	`screen_id` text NOT NULL,
	`device_id` text NOT NULL,
	`secret_hash` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`issued_at` integer NOT NULL,
	`last_used_at` integer,
	`expires_at` integer,
	`revoked_at` integer,
	`replaced_by` text,
	`rotation_pending` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`screen_id`) REFERENCES `screens`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `device_credentials_device_idx` ON `device_credentials` (`device_id`);--> statement-breakpoint
CREATE INDEX `device_credentials_screen_idx` ON `device_credentials` (`screen_id`);--> statement-breakpoint
CREATE TABLE `device_incidents` (
	`id` text PRIMARY KEY NOT NULL,
	`screen_id` text NOT NULL,
	`company_id` text NOT NULL,
	`type` text NOT NULL,
	`opened_at` integer NOT NULL,
	`closed_at` integer,
	`detail` text,
	FOREIGN KEY (`screen_id`) REFERENCES `screens`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `device_incidents_screen_idx` ON `device_incidents` (`screen_id`,`opened_at`);--> statement-breakpoint
CREATE INDEX `device_incidents_open_idx` ON `device_incidents` (`company_id`,`closed_at`);--> statement-breakpoint
CREATE TABLE `invitations` (
	`id` text PRIMARY KEY NOT NULL,
	`company_id` text NOT NULL,
	`email` text NOT NULL,
	`role` text NOT NULL,
	`token_hash` text NOT NULL,
	`invited_by_user_id` text NOT NULL,
	`expires_at` integer NOT NULL,
	`accepted_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`invited_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `invitations_token_idx` ON `invitations` (`token_hash`);--> statement-breakpoint
CREATE TABLE `invoices` (
	`id` text PRIMARY KEY NOT NULL,
	`company_id` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`currency` text DEFAULT 'UZS' NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`period_start` integer NOT NULL,
	`period_end` integer NOT NULL,
	`paid_at` integer,
	`external_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `invoices_company_idx` ON `invoices` (`company_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `media_assets` (
	`id` text PRIMARY KEY NOT NULL,
	`company_id` text NOT NULL,
	`sha256` text NOT NULL,
	`kind` text NOT NULL,
	`state` text DEFAULT 'processing' NOT NULL,
	`mime` text NOT NULL,
	`bytes` integer DEFAULT 0 NOT NULL,
	`width` integer,
	`height` integer,
	`duration_ms` integer,
	`poster_asset_id` text,
	`probe_json` text,
	`transcoded` integer DEFAULT false NOT NULL,
	`error` text,
	`folder_id` text,
	`created_by_user_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`archived_at` integer,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`folder_id`) REFERENCES `media_folders`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `media_assets_company_sha_idx` ON `media_assets` (`company_id`,`sha256`);--> statement-breakpoint
CREATE INDEX `media_assets_company_state_idx` ON `media_assets` (`company_id`,`state`);--> statement-breakpoint
CREATE INDEX `media_assets_folder_idx` ON `media_assets` (`folder_id`);--> statement-breakpoint
CREATE TABLE `media_folders` (
	`id` text PRIMARY KEY NOT NULL,
	`company_id` text NOT NULL,
	`parent_id` text,
	`name` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `media_folders_company_idx` ON `media_folders` (`company_id`);--> statement-breakpoint
CREATE TABLE `media_tag_links` (
	`asset_id` text NOT NULL,
	`tag_id` text NOT NULL,
	PRIMARY KEY(`asset_id`, `tag_id`),
	FOREIGN KEY (`asset_id`) REFERENCES `media_assets`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tag_id`) REFERENCES `media_tags`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `media_tags` (
	`id` text PRIMARY KEY NOT NULL,
	`company_id` text NOT NULL,
	`name` text NOT NULL,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `media_tags_company_name_idx` ON `media_tags` (`company_id`,`name`);--> statement-breakpoint
CREATE TABLE `membership_scopes` (
	`id` text PRIMARY KEY NOT NULL,
	`membership_id` text NOT NULL,
	`scope_type` text NOT NULL,
	`scope_id` text NOT NULL,
	FOREIGN KEY (`membership_id`) REFERENCES `memberships`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `membership_scopes_idx` ON `membership_scopes` (`membership_id`,`scope_type`,`scope_id`);--> statement-breakpoint
CREATE INDEX `membership_scopes_lookup_idx` ON `membership_scopes` (`scope_type`,`scope_id`);--> statement-breakpoint
CREATE TABLE `memberships` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`company_id` text NOT NULL,
	`role` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `memberships_user_company_idx` ON `memberships` (`user_id`,`company_id`);--> statement-breakpoint
CREATE INDEX `memberships_company_idx` ON `memberships` (`company_id`);--> statement-breakpoint
CREATE TABLE `pairing_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`code_hash` text NOT NULL,
	`device_nonce_hash` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`max_attempts` integer DEFAULT 8 NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`confirmed_at` integer,
	`confirmed_by_user_id` text,
	`company_id` text,
	`branch_id` text,
	`screen_id` text,
	`provisional_device_id` text,
	`credentials_issued_at` integer,
	`reject_reason` text,
	`created_ip` text,
	`last_attempt_at` integer,
	FOREIGN KEY (`confirmed_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`screen_id`) REFERENCES `screens`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `pairing_sessions_status_idx` ON `pairing_sessions` (`status`);--> statement-breakpoint
CREATE INDEX `pairing_sessions_expiry_idx` ON `pairing_sessions` (`expires_at`);--> statement-breakpoint
CREATE INDEX `pairing_sessions_created_idx` ON `pairing_sessions` (`created_at`);--> statement-breakpoint
CREATE TABLE `plans` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`screens_limit` integer NOT NULL,
	`branches_limit` integer NOT NULL,
	`storage_bytes_limit` integer NOT NULL,
	`seats_limit` integer NOT NULL,
	`event_retention_days` integer DEFAULT 30 NOT NULL,
	`monthly_price_cents` integer DEFAULT 0 NOT NULL,
	`currency` text DEFAULT 'UZS' NOT NULL,
	`is_active` integer DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE `playback_events` (
	`id` text PRIMARY KEY NOT NULL,
	`screen_id` text NOT NULL,
	`company_id` text NOT NULL,
	`release_id` text,
	`item_id` text,
	`event` text NOT NULL,
	`at` integer NOT NULL,
	`position_ms` integer,
	`error_code` text,
	FOREIGN KEY (`screen_id`) REFERENCES `screens`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`release_id`) REFERENCES `releases`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `playback_events_screen_at_idx` ON `playback_events` (`screen_id`,`at`);--> statement-breakpoint
CREATE INDEX `playback_events_company_at_idx` ON `playback_events` (`company_id`,`at`);--> statement-breakpoint
CREATE TABLE `player_errors` (
	`id` text PRIMARY KEY NOT NULL,
	`screen_id` text NOT NULL,
	`company_id` text NOT NULL,
	`release_id` text,
	`code` text NOT NULL,
	`message` text NOT NULL,
	`context` text,
	`at` integer NOT NULL,
	FOREIGN KEY (`screen_id`) REFERENCES `screens`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`release_id`) REFERENCES `releases`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `player_errors_screen_at_idx` ON `player_errors` (`screen_id`,`at`);--> statement-breakpoint
CREATE TABLE `playlist_items` (
	`id` text PRIMARY KEY NOT NULL,
	`playlist_id` text NOT NULL,
	`media_asset_id` text NOT NULL,
	`position` integer NOT NULL,
	`duration_ms` integer,
	`play_policy` text DEFAULT 'loop_once' NOT NULL,
	`transition` text DEFAULT 'none' NOT NULL,
	`audio` text DEFAULT 'mute' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`playlist_id`) REFERENCES `playlists`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`media_asset_id`) REFERENCES `media_assets`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `playlist_items_position_idx` ON `playlist_items` (`playlist_id`,`position`);--> statement-breakpoint
CREATE INDEX `playlist_items_asset_idx` ON `playlist_items` (`media_asset_id`);--> statement-breakpoint
CREATE TABLE `playlist_version_items` (
	`id` text PRIMARY KEY NOT NULL,
	`version_id` text NOT NULL,
	`position` integer NOT NULL,
	`media_asset_id` text NOT NULL,
	`duration_ms` integer NOT NULL,
	`play_policy` text NOT NULL,
	`transition` text NOT NULL,
	`audio` text NOT NULL,
	FOREIGN KEY (`version_id`) REFERENCES `playlist_versions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `playlist_version_items_idx` ON `playlist_version_items` (`version_id`,`position`);--> statement-breakpoint
CREATE TABLE `playlist_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`playlist_id` text NOT NULL,
	`version` integer NOT NULL,
	`total_duration_ms` integer DEFAULT 0 NOT NULL,
	`note` text,
	`created_by_user_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`playlist_id`) REFERENCES `playlists`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `playlist_versions_idx` ON `playlist_versions` (`playlist_id`,`version`);--> statement-breakpoint
CREATE TABLE `playlists` (
	`id` text PRIMARY KEY NOT NULL,
	`company_id` text NOT NULL,
	`name` text NOT NULL,
	`state` text DEFAULT 'draft' NOT NULL,
	`current_version_id` text,
	`created_by_user_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `playlists_company_idx` ON `playlists` (`company_id`);--> statement-breakpoint
CREATE TABLE `rate_limit_buckets` (
	`key` text PRIMARY KEY NOT NULL,
	`window_start` integer NOT NULL,
	`count` integer DEFAULT 0 NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `rate_limit_buckets_window_idx` ON `rate_limit_buckets` (`window_start`);--> statement-breakpoint
CREATE TABLE `release_assignments` (
	`id` text PRIMARY KEY NOT NULL,
	`company_id` text NOT NULL,
	`scope_type` text NOT NULL,
	`scope_id` text NOT NULL,
	`playlist_version_id` text NOT NULL,
	`fallback_playlist_version_id` text,
	`priority` integer DEFAULT 0 NOT NULL,
	`is_default` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`playlist_version_id`) REFERENCES `playlist_versions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`fallback_playlist_version_id`) REFERENCES `playlist_versions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `release_assignments_lookup_idx` ON `release_assignments` (`company_id`,`scope_type`,`scope_id`);--> statement-breakpoint
CREATE TABLE `release_targets` (
	`id` text PRIMARY KEY NOT NULL,
	`release_id` text NOT NULL,
	`screen_id` text NOT NULL,
	FOREIGN KEY (`release_id`) REFERENCES `releases`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`screen_id`) REFERENCES `screens`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `release_targets_idx` ON `release_targets` (`release_id`,`screen_id`);--> statement-breakpoint
CREATE INDEX `release_targets_screen_idx` ON `release_targets` (`screen_id`);--> statement-breakpoint
CREATE TABLE `releases` (
	`id` text PRIMARY KEY NOT NULL,
	`company_id` text NOT NULL,
	`campaign_id` text,
	`manifest_version` integer NOT NULL,
	`manifest_json` text NOT NULL,
	`manifest_hash` text NOT NULL,
	`item_count` integer DEFAULT 0 NOT NULL,
	`reason` text,
	`created_by_user_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`campaign_id`) REFERENCES `campaigns`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `releases_company_version_idx` ON `releases` (`company_id`,`manifest_version`);--> statement-breakpoint
CREATE INDEX `releases_campaign_idx` ON `releases` (`campaign_id`);--> statement-breakpoint
CREATE TABLE `schedule_windows` (
	`id` text PRIMARY KEY NOT NULL,
	`campaign_id` text NOT NULL,
	`days_of_week` integer DEFAULT 127 NOT NULL,
	`start_minute` integer DEFAULT 0 NOT NULL,
	`end_minute` integer DEFAULT 1439 NOT NULL,
	`timezone_source` text DEFAULT 'branch' NOT NULL,
	`timezone_override` text,
	FOREIGN KEY (`campaign_id`) REFERENCES `campaigns`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `schedule_windows_campaign_idx` ON `schedule_windows` (`campaign_id`);--> statement-breakpoint
CREATE TABLE `screen_groups` (
	`id` text PRIMARY KEY NOT NULL,
	`company_id` text NOT NULL,
	`branch_id` text,
	`name` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `screen_groups_company_idx` ON `screen_groups` (`company_id`);--> statement-breakpoint
CREATE TABLE `screen_publications` (
	`screen_id` text PRIMARY KEY NOT NULL,
	`company_id` text NOT NULL,
	`desired_release_id` text,
	`applied_release_id` text,
	`desired_version` integer,
	`applied_version` integer,
	`applied_at` integer,
	`next_change_at` integer,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`screen_id`) REFERENCES `screens`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`desired_release_id`) REFERENCES `releases`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`applied_release_id`) REFERENCES `releases`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `screen_publications_company_idx` ON `screen_publications` (`company_id`);--> statement-breakpoint
CREATE TABLE `screens` (
	`id` text PRIMARY KEY NOT NULL,
	`company_id` text NOT NULL,
	`branch_id` text,
	`group_id` text,
	`name` text NOT NULL,
	`status` text DEFAULT 'paired' NOT NULL,
	`last_seen_at` integer,
	`player_version` text,
	`capabilities_json` text,
	`heartbeat_interval_sec` integer DEFAULT 30 NOT NULL,
	`offline_after_sec` integer DEFAULT 90 NOT NULL,
	`timezone_override` text,
	`paired_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`group_id`) REFERENCES `screen_groups`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `screens_company_status_idx` ON `screens` (`company_id`,`status`);--> statement-breakpoint
CREATE INDEX `screens_last_seen_idx` ON `screens` (`last_seen_at`);--> statement-breakpoint
CREATE INDEX `screens_branch_idx` ON `screens` (`branch_id`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`csrf_secret` text NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`last_seen_at` integer NOT NULL,
	`revoked_at` integer,
	`ip` text,
	`user_agent` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sessions_token_idx` ON `sessions` (`token_hash`);--> statement-breakpoint
CREATE INDEX `sessions_user_idx` ON `sessions` (`user_id`);--> statement-breakpoint
CREATE INDEX `sessions_expiry_idx` ON `sessions` (`expires_at`);--> statement-breakpoint
CREATE TABLE `subscriptions` (
	`id` text PRIMARY KEY NOT NULL,
	`company_id` text NOT NULL,
	`plan_id` text NOT NULL,
	`status` text DEFAULT 'trial' NOT NULL,
	`current_period_start` integer NOT NULL,
	`current_period_end` integer NOT NULL,
	`trial_ends_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`plan_id`) REFERENCES `plans`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `subscriptions_company_idx` ON `subscriptions` (`company_id`);--> statement-breakpoint
CREATE TABLE `usage_counters` (
	`company_id` text NOT NULL,
	`key` text NOT NULL,
	`value` integer DEFAULT 0 NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`company_id`, `key`),
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`password_hash` text NOT NULL,
	`name` text NOT NULL,
	`locale` text DEFAULT 'ru' NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_idx` ON `users` (`email`);
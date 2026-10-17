ALTER TABLE `pairing_sessions` ADD `device_nonce_hash` text NOT NULL;--> statement-breakpoint
ALTER TABLE `pairing_sessions` ADD `provisional_device_id` text;--> statement-breakpoint
ALTER TABLE `companies` DROP COLUMN `pairing_require_code`;
ALTER TABLE `pairing_sessions` ADD `code_lookup_hash` text;--> statement-breakpoint
CREATE INDEX `pairing_sessions_code_lookup_idx` ON `pairing_sessions` (`code_lookup_hash`);
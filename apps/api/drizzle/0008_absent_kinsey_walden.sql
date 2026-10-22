ALTER TABLE `companies` ADD `onboarding_completed_at` integer;--> statement-breakpoint
-- Существующие сети уже настроены: модалка первого входа нужна только тем,
-- кто создан после этой миграции.
UPDATE `companies` SET `onboarding_completed_at` = `created_at` WHERE `onboarding_completed_at` IS NULL;
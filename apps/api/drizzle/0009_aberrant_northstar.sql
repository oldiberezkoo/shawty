ALTER TABLE `subscriptions` ADD `extra_screens` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `subscriptions` ADD `extra_storage_bytes` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
-- Тарифы по умолчанию переносятся вместе с названием и лимитами.
-- Цены в тийинах: 199 000 сум = 19 900 000, 499 000 сум = 49 900 000.
UPDATE `plans` SET `name` = 'Free', `screens_limit` = 2, `branches_limit` = 1,
  `storage_bytes_limit` = 268435456, `seats_limit` = 1, `event_retention_days` = 14,
  `monthly_price_cents` = 0, `currency` = 'UZS'
  WHERE `id` = 'plan-starter';--> statement-breakpoint
UPDATE `plans` SET `name` = 'Growth', `screens_limit` = 5, `branches_limit` = 3,
  `storage_bytes_limit` = 270532608, `seats_limit` = 2, `event_retention_days` = 60,
  `monthly_price_cents` = 19900000, `currency` = 'UZS'
  WHERE `id` = 'plan-growth';--> statement-breakpoint
UPDATE `plans` SET `name` = 'Pro', `screens_limit` = 8, `branches_limit` = 5,
  `storage_bytes_limit` = 1073741824, `seats_limit` = 5, `event_retention_days` = 180,
  `monthly_price_cents` = 49900000, `currency` = 'UZS'
  WHERE `id` = 'plan-pro';

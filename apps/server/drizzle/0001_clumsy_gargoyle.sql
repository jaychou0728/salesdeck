CREATE TABLE `follow_ups` (
	`id` text PRIMARY KEY NOT NULL,
	`customer_id` text NOT NULL,
	`opportunity_id` text,
	`actor_id` text NOT NULL,
	`type` text NOT NULL,
	`content` text NOT NULL,
	`result` text,
	`next_action` text,
	`next_action_due_at` integer,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `follow_ups_customer_idx` ON `follow_ups` (`customer_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `follow_ups_opportunity_idx` ON `follow_ups` (`opportunity_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `opportunities` (
	`id` text PRIMARY KEY NOT NULL,
	`customer_id` text NOT NULL,
	`owner_id` text NOT NULL,
	`name` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`stage` text NOT NULL,
	`probability` integer DEFAULT 0 NOT NULL,
	`expected_close_date` integer NOT NULL,
	`next_action` text,
	`next_action_due_at` integer,
	`risk_level` text DEFAULT 'low' NOT NULL,
	`last_follow_up_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `opportunities_customer_idx` ON `opportunities` (`customer_id`);--> statement-breakpoint
CREATE INDEX `opportunities_owner_stage_idx` ON `opportunities` (`owner_id`,`stage`);--> statement-breakpoint
CREATE INDEX `opportunities_due_idx` ON `opportunities` (`next_action_due_at`);--> statement-breakpoint
ALTER TABLE `orders` ADD `opportunity_id` text;--> statement-breakpoint
ALTER TABLE `quotes` ADD `opportunity_id` text;--> statement-breakpoint
ALTER TABLE `users` ADD `monthly_target_cents` integer DEFAULT 0 NOT NULL;
CREATE TABLE `after_sales_tickets` (
	`id` text PRIMARY KEY NOT NULL,
	`ticket_no` text NOT NULL,
	`customer_id` text NOT NULL,
	`order_id` text,
	`product_id` text NOT NULL,
	`serial_no` text,
	`issue_type` text NOT NULL,
	`description` text NOT NULL,
	`status` text NOT NULL,
	`policy_refs` text DEFAULT '[]' NOT NULL,
	`resolution` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tickets_no_idx` ON `after_sales_tickets` (`ticket_no`);--> statement-breakpoint
CREATE TABLE `approvals` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`target_type` text NOT NULL,
	`target_id` text NOT NULL,
	`requester_id` text NOT NULL,
	`approver_id` text,
	`status` text NOT NULL,
	`reason` text NOT NULL,
	`comment` text,
	`payload_json` text DEFAULT '{}' NOT NULL,
	`created_at` integer NOT NULL,
	`decided_at` integer
);
--> statement-breakpoint
CREATE TABLE `audit_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`trace_id` text,
	`actor_id` text NOT NULL,
	`tool_name` text NOT NULL,
	`args_json` text NOT NULL,
	`result_json` text NOT NULL,
	`status` text NOT NULL,
	`latency_ms` integer NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `confirmation_tokens` (
	`id` text PRIMARY KEY NOT NULL,
	`actor_id` text NOT NULL,
	`tool_name` text NOT NULL,
	`payload_hash` text NOT NULL,
	`expires_at` integer NOT NULL,
	`used_at` integer,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `contacts` (
	`id` text PRIMARY KEY NOT NULL,
	`customer_id` text NOT NULL,
	`name` text NOT NULL,
	`title` text NOT NULL,
	`phone` text NOT NULL,
	`email` text NOT NULL,
	`is_primary` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE `conversations` (
	`id` text PRIMARY KEY NOT NULL,
	`actor_id` text NOT NULL,
	`title` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `customers` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`industry` text NOT NULL,
	`level` text NOT NULL,
	`owner_id` text NOT NULL,
	`region` text NOT NULL,
	`credit_limit_cents` integer NOT NULL,
	`credit_used_cents` integer DEFAULT 0 NOT NULL,
	`payment_terms` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL
);
--> statement-breakpoint
CREATE TABLE `idempotency_keys` (
	`key` text PRIMARY KEY NOT NULL,
	`actor_id` text NOT NULL,
	`tool_name` text NOT NULL,
	`request_hash` text NOT NULL,
	`response_json` text NOT NULL,
	`status` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `inventory` (
	`warehouse_id` text NOT NULL,
	`product_id` text NOT NULL,
	`on_hand` integer DEFAULT 0 NOT NULL,
	`reserved` integer DEFAULT 0 NOT NULL,
	`safety_stock` integer DEFAULT 0 NOT NULL,
	`eta_days` integer DEFAULT 1 NOT NULL,
	`version` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`warehouse_id`, `product_id`)
);
--> statement-breakpoint
CREATE INDEX `inventory_product_idx` ON `inventory` (`product_id`);--> statement-breakpoint
CREATE TABLE `knowledge_chunks` (
	`id` text PRIMARY KEY NOT NULL,
	`doc_id` text NOT NULL,
	`heading` text NOT NULL,
	`content` text NOT NULL,
	`embedding_json` text NOT NULL,
	`token_count` integer NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `knowledge_chunks_doc_idx` ON `knowledge_chunks` (`doc_id`);--> statement-breakpoint
CREATE TABLE `knowledge_docs` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`type` text NOT NULL,
	`effective_date` text,
	`content_hash` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `messages` (
	`id` text PRIMARY KEY NOT NULL,
	`conversation_id` text NOT NULL,
	`role` text NOT NULL,
	`content` text,
	`tool_calls_json` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `order_lines` (
	`id` text PRIMARY KEY NOT NULL,
	`order_id` text NOT NULL,
	`product_id` text NOT NULL,
	`quantity` integer NOT NULL,
	`unit_price_cents` integer NOT NULL,
	`warehouse_id` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `orders` (
	`id` text PRIMARY KEY NOT NULL,
	`order_no` text NOT NULL,
	`quote_id` text NOT NULL,
	`customer_id` text NOT NULL,
	`owner_id` text NOT NULL,
	`status` text NOT NULL,
	`total_cents` integer NOT NULL,
	`payment_terms` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `orders_no_idx` ON `orders` (`order_no`);--> statement-breakpoint
CREATE TABLE `price_rules` (
	`id` text PRIMARY KEY NOT NULL,
	`product_id` text NOT NULL,
	`customer_level` text NOT NULL,
	`min_qty` integer NOT NULL,
	`unit_price_cents` integer NOT NULL,
	`discount_bps` integer DEFAULT 0 NOT NULL,
	`priority` integer DEFAULT 0 NOT NULL,
	`effective_from` integer NOT NULL,
	`effective_to` integer
);
--> statement-breakpoint
CREATE TABLE `products` (
	`id` text PRIMARY KEY NOT NULL,
	`sku` text NOT NULL,
	`name` text NOT NULL,
	`category` text NOT NULL,
	`unit` text DEFAULT '台' NOT NULL,
	`list_price_cents` integer NOT NULL,
	`cost_cents` integer NOT NULL,
	`floor_price_cents` integer NOT NULL,
	`tax_rate_bps` integer DEFAULT 1300 NOT NULL,
	`status` text DEFAULT 'active' NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `products_sku_idx` ON `products` (`sku`);--> statement-breakpoint
CREATE TABLE `quote_lines` (
	`id` text PRIMARY KEY NOT NULL,
	`quote_id` text NOT NULL,
	`product_id` text NOT NULL,
	`quantity` integer NOT NULL,
	`unit_price_cents` integer NOT NULL,
	`discount_rate_bps` integer DEFAULT 0 NOT NULL,
	`line_total_cents` integer NOT NULL,
	`warehouse_id` text
);
--> statement-breakpoint
CREATE TABLE `quotes` (
	`id` text PRIMARY KEY NOT NULL,
	`quote_no` text NOT NULL,
	`customer_id` text NOT NULL,
	`contact_id` text NOT NULL,
	`owner_id` text NOT NULL,
	`status` text NOT NULL,
	`subtotal_cents` integer NOT NULL,
	`discount_total_cents` integer DEFAULT 0 NOT NULL,
	`tax_total_cents` integer DEFAULT 0 NOT NULL,
	`total_cents` integer NOT NULL,
	`valid_until` integer NOT NULL,
	`risk_flags` text DEFAULT '[]' NOT NULL,
	`notes` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `quotes_no_idx` ON `quotes` (`quote_no`);--> statement-breakpoint
CREATE TABLE `stock_reservations` (
	`id` text PRIMARY KEY NOT NULL,
	`order_id` text NOT NULL,
	`product_id` text NOT NULL,
	`warehouse_id` text NOT NULL,
	`quantity` integer NOT NULL,
	`status` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `trace_events` (
	`id` text PRIMARY KEY NOT NULL,
	`trace_id` text NOT NULL,
	`seq` integer NOT NULL,
	`type` text NOT NULL,
	`name` text,
	`payload_json` text DEFAULT '{}' NOT NULL,
	`status` text,
	`latency_ms` integer,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `trace_events_trace_idx` ON `trace_events` (`trace_id`,`seq`);--> statement-breakpoint
CREATE TABLE `traces` (
	`id` text PRIMARY KEY NOT NULL,
	`conversation_id` text,
	`actor_id` text NOT NULL,
	`status` text NOT NULL,
	`started_at` integer NOT NULL,
	`ended_at` integer,
	`input_tokens` integer DEFAULT 0 NOT NULL,
	`output_tokens` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`role` text NOT NULL,
	`team_id` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `warehouses` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`region` text NOT NULL
);

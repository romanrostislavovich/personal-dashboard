ALTER TABLE "notification_outbox" ADD COLUMN "read_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "notification_outbox" ADD COLUMN "answered_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "notification_outbox" ADD COLUMN "answer" text;--> statement-breakpoint
ALTER TABLE "notification_outbox" ADD COLUMN "answered_via" text;--> statement-breakpoint
ALTER TABLE "notification_outbox" ADD COLUMN "telegram_message" jsonb;
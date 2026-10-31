ALTER TABLE "projects" ADD COLUMN "updated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "birthdays" ADD COLUMN "updated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "finance_recurring_payments" ADD COLUMN "updated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "finance_transactions" ADD COLUMN "updated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "finance_wishes" ADD COLUMN "updated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "psychology_events" ADD COLUMN "updated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "updated_at" timestamp with time zone;
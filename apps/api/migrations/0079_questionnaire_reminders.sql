ALTER TABLE "psychology_settings" ADD COLUMN "reminder_test" text;--> statement-breakpoint
ALTER TABLE "psychology_settings" ADD COLUMN "reminder_every_days" smallint;--> statement-breakpoint
ALTER TABLE "psychology_settings" ADD COLUMN "reminder_at" text;--> statement-breakpoint
ALTER TABLE "psychology_settings" ADD COLUMN "reminded_on" date;
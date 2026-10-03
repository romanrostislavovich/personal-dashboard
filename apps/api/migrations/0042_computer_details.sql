ALTER TABLE "activity_devices" ADD COLUMN "alerted_on" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "activity_health" ADD COLUMN "system" jsonb;
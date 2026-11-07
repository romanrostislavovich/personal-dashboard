ALTER TABLE "links_settings" ADD COLUMN "overload_enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "links_settings" ADD COLUMN "overload_warned_on" date;
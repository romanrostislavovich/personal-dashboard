ALTER TABLE "psychology_events" ALTER COLUMN "started_on" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "psychology_events" ADD COLUMN "age_from" smallint;--> statement-breakpoint
ALTER TABLE "psychology_events" ADD COLUMN "age_to" smallint;--> statement-breakpoint
ALTER TABLE "psychology_settings" ADD COLUMN "birth_year" smallint;
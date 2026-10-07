ALTER TABLE "birthdays" ALTER COLUMN "month" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "birthdays" ALTER COLUMN "day" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "birthdays" ADD COLUMN "death_month" smallint;--> statement-breakpoint
ALTER TABLE "birthdays" ADD COLUMN "death_day" smallint;--> statement-breakpoint
ALTER TABLE "birthdays" ADD COLUMN "death_year" smallint;--> statement-breakpoint
ALTER TABLE "birthdays" ADD COLUMN "memorial_remind_days_before" integer[] DEFAULT '{0,1}' NOT NULL;
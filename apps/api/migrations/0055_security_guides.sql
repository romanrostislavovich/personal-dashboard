ALTER TABLE "security_findings" ADD COLUMN "guide" text;--> statement-breakpoint
ALTER TABLE "security_findings" ADD COLUMN "guide_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "security_settings" DROP COLUMN "repository";
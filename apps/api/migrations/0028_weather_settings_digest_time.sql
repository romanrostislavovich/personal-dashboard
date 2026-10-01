CREATE TABLE "weather_settings" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"thermal_feel" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_settings" ADD COLUMN "morning_digest_time" text DEFAULT '08:30' NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_settings" ADD COLUMN "morning_digest_day" date;--> statement-breakpoint
ALTER TABLE "weather_settings" ADD CONSTRAINT "weather_settings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- The digest already sent today must not go out again right after the update: remember the day
-- of the last one for every user.
UPDATE "ai_settings" s SET "morning_digest_day" = last.day
FROM (SELECT "user_id", max("sent_at")::date AS day FROM "morning_digest_snapshots" GROUP BY "user_id") last
WHERE last."user_id" = s."user_id";

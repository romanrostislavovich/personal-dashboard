CREATE TABLE "activity_site_visits" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"site" text NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone NOT NULL,
	"seconds" integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE "activity_devices" ADD COLUMN "focus_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "activity_settings" ADD COLUMN "track_sites" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "activity_settings" ADD COLUMN "distracting_sites" text[] DEFAULT '{"youtube.com","instagram.com","facebook.com","x.com","twitter.com","reddit.com","tiktok.com","vk.com","twitch.tv"}' NOT NULL;--> statement-breakpoint
ALTER TABLE "activity_site_visits" ADD CONSTRAINT "activity_site_visits_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "activity_site_visits_user_id_started_at_index" ON "activity_site_visits" USING btree ("user_id","started_at");
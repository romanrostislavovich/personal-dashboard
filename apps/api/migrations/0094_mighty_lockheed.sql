CREATE TABLE "lifelog_settings" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"last_attempt_day" text
);
--> statement-breakpoint
ALTER TABLE "lifelog_settings" ADD CONSTRAINT "lifelog_settings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
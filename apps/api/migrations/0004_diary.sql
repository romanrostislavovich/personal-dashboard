CREATE TABLE "diary_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"day" date NOT NULL,
	"content" text DEFAULT '' NOT NULL,
	"mood" smallint,
	"tags" text[] DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "diary_entries_userId_day_unique" UNIQUE("user_id","day")
);
--> statement-breakpoint
CREATE TABLE "diary_settings" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"evening_reminder" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
ALTER TABLE "diary_entries" ADD CONSTRAINT "diary_entries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diary_settings" ADD CONSTRAINT "diary_settings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
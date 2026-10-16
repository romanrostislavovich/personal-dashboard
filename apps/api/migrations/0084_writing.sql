CREATE TABLE "writing_settings" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"language" text DEFAULT 'auto' NOT NULL,
	"english_variant" text DEFAULT 'en-US' NOT NULL,
	"picky" boolean DEFAULT false NOT NULL,
	"dictionary" text[] DEFAULT '{}' NOT NULL,
	"disabled_rules" text[] DEFAULT '{}' NOT NULL,
	"ignored_sites" text[] DEFAULT '{}' NOT NULL,
	"ignored_apps" text[] DEFAULT '{}' NOT NULL
);
--> statement-breakpoint
ALTER TABLE "writing_settings" ADD CONSTRAINT "writing_settings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
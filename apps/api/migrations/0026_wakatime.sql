CREATE TABLE "wakatime_day_breakdown" (
	"user_id" uuid NOT NULL,
	"day" date NOT NULL,
	"kind" text NOT NULL,
	"name" text NOT NULL,
	"seconds" integer NOT NULL,
	CONSTRAINT "wakatime_day_breakdown_user_id_day_kind_name_pk" PRIMARY KEY("user_id","day","kind","name")
);
--> statement-breakpoint
CREATE TABLE "wakatime_days" (
	"user_id" uuid NOT NULL,
	"day" date NOT NULL,
	"total_seconds" integer NOT NULL,
	CONSTRAINT "wakatime_days_user_id_day_pk" PRIMARY KEY("user_id","day")
);
--> statement-breakpoint
CREATE TABLE "wakatime_settings" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"username" text,
	"last_synced_at" timestamp with time zone,
	"sync_error" text
);
--> statement-breakpoint
ALTER TABLE "wakatime_day_breakdown" ADD CONSTRAINT "wakatime_day_breakdown_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wakatime_days" ADD CONSTRAINT "wakatime_days_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wakatime_settings" ADD CONSTRAINT "wakatime_settings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
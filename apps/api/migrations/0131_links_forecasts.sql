CREATE TABLE "links_forecasts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"key" text NOT NULL,
	"module" text NOT NULL,
	"label_key" text NOT NULL,
	"label" text,
	"unit" text NOT NULL,
	"currency" text,
	"day" date NOT NULL,
	"made" text NOT NULL,
	"value" real NOT NULL,
	"error" real NOT NULL,
	"baseline_error" real NOT NULL,
	"baseline" text NOT NULL,
	"days" integer NOT NULL,
	"trusted" boolean NOT NULL,
	"drivers" jsonb NOT NULL,
	"made_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "links_forecasts_userId_key_day_made_unique" UNIQUE("user_id","key","day","made")
);
--> statement-breakpoint
CREATE TABLE "links_settings" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"forecast_targets" text[] DEFAULT '{}' NOT NULL
);
--> statement-breakpoint
ALTER TABLE "links_forecasts" ADD CONSTRAINT "links_forecasts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "links_settings" ADD CONSTRAINT "links_settings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
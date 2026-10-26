CREATE TABLE "health_wearable_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"last_synced_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "health_wearable_accounts_userId_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "health_wearable_days" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"day" date NOT NULL,
	"steps" integer,
	"calories" integer,
	"distance_km" double precision,
	"active_zone_minutes" integer,
	"heart_rate_avg" integer,
	"heart_rate_max" integer,
	"resting_heart_rate" integer,
	"hrv_ms" double precision,
	"spo2" double precision,
	"sleep_minutes" integer,
	"deep_minutes" integer,
	"rem_minutes" integer,
	"light_minutes" integer,
	"awake_minutes" integer,
	"sleep_start" text,
	"sleep_end" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "health_wearable_days_userId_day_unique" UNIQUE("user_id","day")
);
--> statement-breakpoint
ALTER TABLE "health_wearable_accounts" ADD CONSTRAINT "health_wearable_accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "health_wearable_days" ADD CONSTRAINT "health_wearable_days_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
CREATE TABLE "health_band_days" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"day" date NOT NULL,
	"steps" integer,
	"calories" integer,
	"distance_km" double precision,
	"heart_rate_avg" integer,
	"heart_rate_max" integer,
	"resting_heart_rate" integer,
	"rest_bpm" integer,
	"hrv_ms" double precision,
	"sleep_minutes" integer,
	"deep_minutes" integer,
	"rem_minutes" integer,
	"light_minutes" integer,
	"awake_minutes" integer,
	"sleep_start" text,
	"sleep_end" text,
	"sleep_score" integer,
	"stress_score" integer,
	"resilience" integer,
	"reactions" integer,
	"mindfulness_minutes" integer,
	"skin_temp_delta" double precision,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "health_band_days_userId_day_unique" UNIQUE("user_id","day")
);
--> statement-breakpoint
CREATE TABLE "health_band_hours" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"at" timestamp with time zone NOT NULL,
	"steps" integer,
	"calories" double precision,
	"distance_m" double precision,
	"floors" double precision,
	CONSTRAINT "health_band_hours_userId_at_unique" UNIQUE("user_id","at")
);
--> statement-breakpoint
CREATE TABLE "health_band_minutes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"at" timestamp with time zone NOT NULL,
	"bpm" double precision,
	"bpm_min" integer,
	"bpm_max" integer,
	"steps" integer,
	CONSTRAINT "health_band_minutes_userId_at_unique" UNIQUE("user_id","at")
);
--> statement-breakpoint
CREATE TABLE "health_band_points" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"at" timestamp with time zone NOT NULL,
	"value" double precision NOT NULL,
	CONSTRAINT "health_band_points_userId_kind_at_unique" UNIQUE("user_id","kind","at")
);
--> statement-breakpoint
CREATE TABLE "health_band_reactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"start_at" timestamp with time zone NOT NULL,
	"end_at" timestamp with time zone NOT NULL,
	"peak_bpm" integer NOT NULL,
	"baseline_bpm" integer NOT NULL,
	"score" integer NOT NULL,
	"feeling" text,
	"notified_at" timestamp with time zone,
	CONSTRAINT "health_band_reactions_userId_startAt_unique" UNIQUE("user_id","start_at")
);
--> statement-breakpoint
CREATE TABLE "health_band_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"start_at" timestamp with time zone NOT NULL,
	"end_at" timestamp with time zone NOT NULL,
	"type" integer,
	"title" text,
	"stages" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"source" text DEFAULT 'phone' NOT NULL,
	CONSTRAINT "health_band_sessions_userId_kind_startAt_unique" UNIQUE("user_id","kind","start_at")
);
--> statement-breakpoint
CREATE TABLE "health_band_stress_hours" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"at" timestamp with time zone NOT NULL,
	"score" integer NOT NULL,
	"rest_minutes" integer NOT NULL,
	CONSTRAINT "health_band_stress_hours_userId_at_unique" UNIQUE("user_id","at")
);
--> statement-breakpoint
ALTER TABLE "health_band_days" ADD CONSTRAINT "health_band_days_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "health_band_hours" ADD CONSTRAINT "health_band_hours_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "health_band_minutes" ADD CONSTRAINT "health_band_minutes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "health_band_points" ADD CONSTRAINT "health_band_points_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "health_band_reactions" ADD CONSTRAINT "health_band_reactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "health_band_sessions" ADD CONSTRAINT "health_band_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "health_band_stress_hours" ADD CONSTRAINT "health_band_stress_hours_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
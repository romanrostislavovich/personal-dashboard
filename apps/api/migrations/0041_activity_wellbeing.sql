CREATE TABLE "activity_focus_sessions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"device_id" uuid NOT NULL,
	"project_id" uuid,
	"note" text,
	"started_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone NOT NULL,
	"planned_minutes" integer NOT NULL,
	"focus_seconds" integer NOT NULL,
	"completed" boolean NOT NULL,
	"distractions" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "activity_health" (
	"user_id" uuid NOT NULL,
	"device_id" uuid NOT NULL,
	"at" timestamp with time zone NOT NULL,
	"cpu" real NOT NULL,
	"memory_used" bigint NOT NULL,
	"memory_total" bigint NOT NULL,
	"uptime_seconds" integer NOT NULL,
	"disks" jsonb NOT NULL,
	CONSTRAINT "activity_health_device_id_at_pk" PRIMARY KEY("device_id","at")
);
--> statement-breakpoint
CREATE TABLE "activity_limits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"app" text,
	"minutes" integer NOT NULL,
	"notified_on" date
);
--> statement-breakpoint
ALTER TABLE "activity_devices" ADD COLUMN "disk_alerted_on" date;--> statement-breakpoint
ALTER TABLE "activity_settings" ADD COLUMN "break_minutes" integer DEFAULT 60 NOT NULL;--> statement-breakpoint
ALTER TABLE "activity_settings" ADD COLUMN "focus_minutes" integer DEFAULT 25 NOT NULL;--> statement-breakpoint
ALTER TABLE "activity_settings" ADD COLUMN "short_break_minutes" integer DEFAULT 5 NOT NULL;--> statement-breakpoint
ALTER TABLE "activity_settings" ADD COLUMN "long_break_minutes" integer DEFAULT 15 NOT NULL;--> statement-breakpoint
ALTER TABLE "activity_settings" ADD COLUMN "rounds_before_long_break" integer DEFAULT 4 NOT NULL;--> statement-breakpoint
ALTER TABLE "activity_focus_sessions" ADD CONSTRAINT "activity_focus_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_focus_sessions" ADD CONSTRAINT "activity_focus_sessions_device_id_activity_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."activity_devices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_focus_sessions" ADD CONSTRAINT "activity_focus_sessions_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_health" ADD CONSTRAINT "activity_health_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_health" ADD CONSTRAINT "activity_health_device_id_activity_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."activity_devices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_limits" ADD CONSTRAINT "activity_limits_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "activity_focus_sessions_user_id_started_at_index" ON "activity_focus_sessions" USING btree ("user_id","started_at");
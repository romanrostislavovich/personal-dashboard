CREATE TYPE "public"."monitoring_status" AS ENUM('up', 'down', 'pending');--> statement-breakpoint
CREATE TABLE "monitoring_check_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"monitor_id" uuid NOT NULL,
	"checked_at" timestamp with time zone DEFAULT now() NOT NULL,
	"is_up" boolean NOT NULL,
	"status_code" smallint,
	"response_ms" integer
);
--> statement-breakpoint
CREATE TABLE "monitoring_monitors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"url" text NOT NULL,
	"status" "monitoring_status" DEFAULT 'pending' NOT NULL,
	"consecutive_failures" smallint DEFAULT 0 NOT NULL,
	"failing_since" timestamp with time zone,
	"last_checked_at" timestamp with time zone,
	"last_status_code" smallint,
	"last_response_ms" integer,
	"last_error" text,
	"ssl_expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "monitoring_check_results" ADD CONSTRAINT "monitoring_check_results_monitor_id_monitoring_monitors_id_fk" FOREIGN KEY ("monitor_id") REFERENCES "public"."monitoring_monitors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "monitoring_monitors" ADD CONSTRAINT "monitoring_monitors_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "monitoring_monitors" ADD CONSTRAINT "monitoring_monitors_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "monitoring_check_results_monitor_id_checked_at_index" ON "monitoring_check_results" USING btree ("monitor_id","checked_at");
CREATE TABLE "activity_apps" (
	"user_id" uuid NOT NULL,
	"app" text NOT NULL,
	"category" text,
	"excluded" boolean DEFAULT false NOT NULL,
	CONSTRAINT "activity_apps_user_id_app_pk" PRIMARY KEY("user_id","app")
);
--> statement-breakpoint
CREATE TABLE "activity_devices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"platform" text NOT NULL,
	"token_hash" text NOT NULL,
	"last_seen_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "activity_devices_tokenHash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "activity_project_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"pattern" text NOT NULL,
	CONSTRAINT "activity_project_rules_userId_projectId_pattern_unique" UNIQUE("user_id","project_id","pattern")
);
--> statement-breakpoint
CREATE TABLE "activity_settings" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"idle_minutes" integer DEFAULT 5 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "activity_spans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"device_id" uuid NOT NULL,
	"app" text NOT NULL,
	"app_name" text NOT NULL,
	"title" text NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone NOT NULL,
	"seconds" integer NOT NULL,
	CONSTRAINT "activity_spans_deviceId_startedAt_unique" UNIQUE("device_id","started_at")
);
--> statement-breakpoint
ALTER TABLE "activity_apps" ADD CONSTRAINT "activity_apps_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_devices" ADD CONSTRAINT "activity_devices_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_project_rules" ADD CONSTRAINT "activity_project_rules_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_project_rules" ADD CONSTRAINT "activity_project_rules_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_settings" ADD CONSTRAINT "activity_settings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_spans" ADD CONSTRAINT "activity_spans_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_spans" ADD CONSTRAINT "activity_spans_device_id_activity_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."activity_devices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "activity_spans_user_id_started_at_index" ON "activity_spans" USING btree ("user_id","started_at");
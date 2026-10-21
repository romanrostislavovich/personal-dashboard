CREATE TABLE "lifelog_narratives" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"day" text NOT NULL,
	"summary_text" text,
	"key_highlight" text,
	"generated_by" text,
	"sources" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"note" text NOT NULL,
	"generated_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lifelog_narratives_userId_day_unique" UNIQUE("user_id","day")
);
--> statement-breakpoint
CREATE TABLE "activity_workstates" (
	"user_id" uuid NOT NULL,
	"id" uuid NOT NULL,
	"device_id" uuid,
	"captured_at" timestamp with time zone NOT NULL,
	"capture" text NOT NULL,
	CONSTRAINT "activity_workstates_user_id_id_pk" PRIMARY KEY("user_id","id")
);
--> statement-breakpoint
CREATE TABLE "telemetry_dynamics" (
	"user_id" uuid NOT NULL,
	"id" uuid NOT NULL,
	"device_id" uuid,
	"source" text NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone NOT NULL,
	"metrics" jsonb NOT NULL,
	"page" text,
	CONSTRAINT "telemetry_dynamics_user_id_id_pk" PRIMARY KEY("user_id","id")
);
--> statement-breakpoint
ALTER TABLE "lifelog_narratives" ADD CONSTRAINT "lifelog_narratives_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_workstates" ADD CONSTRAINT "activity_workstates_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_workstates" ADD CONSTRAINT "activity_workstates_device_id_activity_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."activity_devices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "telemetry_dynamics" ADD CONSTRAINT "telemetry_dynamics_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "telemetry_dynamics" ADD CONSTRAINT "telemetry_dynamics_device_id_activity_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."activity_devices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "activity_workstates_user_id_captured_at_id_index" ON "activity_workstates" USING btree ("user_id","captured_at","id");--> statement-breakpoint
CREATE INDEX "activity_workstates_device_id_index" ON "activity_workstates" USING btree ("device_id");--> statement-breakpoint
CREATE INDEX "telemetry_dynamics_user_id_started_at_id_index" ON "telemetry_dynamics" USING btree ("user_id","started_at","id");--> statement-breakpoint
CREATE INDEX "telemetry_dynamics_device_id_index" ON "telemetry_dynamics" USING btree ("device_id");
CREATE TABLE "psychology_briefs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"title" text NOT NULL,
	"appointment_on" date,
	"from" date NOT NULL,
	"to" date NOT NULL,
	"event_ids" uuid[] DEFAULT '{}' NOT NULL,
	"assessment_ids" uuid[] DEFAULT '{}' NOT NULL,
	"changes" text DEFAULT '' NOT NULL,
	"questions" text DEFAULT '' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "psychology_gentle_days" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"local_date" date NOT NULL,
	"steps" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "psychology_gentle_steps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"text" text NOT NULL,
	"smaller" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "psychology_briefs" ADD CONSTRAINT "psychology_briefs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "psychology_gentle_days" ADD CONSTRAINT "psychology_gentle_days_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "psychology_gentle_steps" ADD CONSTRAINT "psychology_gentle_steps_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "psychology_briefs_user_id_from_index" ON "psychology_briefs" USING btree ("user_id","from");--> statement-breakpoint
CREATE UNIQUE INDEX "psychology_gentle_days_user_id_local_date_index" ON "psychology_gentle_days" USING btree ("user_id","local_date");--> statement-breakpoint
CREATE INDEX "psychology_gentle_steps_user_id_index" ON "psychology_gentle_steps" USING btree ("user_id");
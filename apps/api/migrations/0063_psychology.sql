CREATE TABLE "psychology_assessments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"test" text NOT NULL,
	"taken_on" date NOT NULL,
	"answers" integer[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "psychology_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"started_on" date NOT NULL,
	"ended_on" date,
	"feeling" smallint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "psychology_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"day" date NOT NULL,
	"text" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "psychology_reflections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"week" date NOT NULL,
	"questions" text[] NOT NULL,
	"answers" text[] DEFAULT '{}' NOT NULL,
	"by_ai" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "psychology_reflections_userId_week_unique" UNIQUE("user_id","week")
);
--> statement-breakpoint
CREATE TABLE "psychology_settings" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"weekly_review" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
ALTER TABLE "psychology_assessments" ADD CONSTRAINT "psychology_assessments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "psychology_events" ADD CONSTRAINT "psychology_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "psychology_notes" ADD CONSTRAINT "psychology_notes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "psychology_reflections" ADD CONSTRAINT "psychology_reflections_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "psychology_settings" ADD CONSTRAINT "psychology_settings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "psychology_assessments_user_id_test_taken_on_index" ON "psychology_assessments" USING btree ("user_id","test","taken_on");--> statement-breakpoint
CREATE INDEX "psychology_events_user_id_started_on_index" ON "psychology_events" USING btree ("user_id","started_on");--> statement-breakpoint
CREATE INDEX "psychology_notes_user_id_day_index" ON "psychology_notes" USING btree ("user_id","day");
CREATE SCHEMA "system";
--> statement-breakpoint
CREATE TABLE "system"."job_runs" (
	"name" text PRIMARY KEY NOT NULL,
	"cron" text NOT NULL,
	"last_started_at" timestamp with time zone,
	"last_finished_at" timestamp with time zone,
	"last_duration_ms" integer,
	"failures" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"last_error_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "system"."log" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"level" text NOT NULL,
	"source" text NOT NULL,
	"message" text NOT NULL,
	"details" text,
	"count" integer DEFAULT 1 NOT NULL,
	"first_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "log_last_at_index" ON "system"."log" USING btree ("last_at");
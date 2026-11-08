CREATE TABLE "links_experiment_days" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"experiment_id" uuid NOT NULL,
	"day" date NOT NULL,
	"rating" smallint,
	"kept" boolean,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "links_experiment_days_experimentId_day_unique" UNIQUE("experiment_id","day")
);
--> statement-breakpoint
CREATE TABLE "links_experiment_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"experiment_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"hypothesis" text NOT NULL,
	"change" text NOT NULL,
	"morning_at" text NOT NULL,
	"ask_at" text,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "links_experiment_versions_experimentId_version_unique" UNIQUE("experiment_id","version")
);
--> statement-breakpoint
CREATE TABLE "links_experiments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"hypothesis" text NOT NULL,
	"change" text NOT NULL,
	"metric_kind" text NOT NULL,
	"metric_key" text,
	"question" text,
	"ask_at" text,
	"morning_at" text NOT NULL,
	"start_on" date NOT NULL,
	"end_on" date NOT NULL,
	"schedule" jsonb NOT NULL,
	"status" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "links_experiment_days" ADD CONSTRAINT "links_experiment_days_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "links_experiment_days" ADD CONSTRAINT "links_experiment_days_experiment_id_links_experiments_id_fk" FOREIGN KEY ("experiment_id") REFERENCES "public"."links_experiments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "links_experiment_versions" ADD CONSTRAINT "links_experiment_versions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "links_experiment_versions" ADD CONSTRAINT "links_experiment_versions_experiment_id_links_experiments_id_fk" FOREIGN KEY ("experiment_id") REFERENCES "public"."links_experiments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "links_experiments" ADD CONSTRAINT "links_experiments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "links_experiments_user_id_index" ON "links_experiments" USING btree ("user_id");
CREATE TYPE "public"."finance_cost_provider" AS ENUM('hetzner', 'deepseek');--> statement-breakpoint
CREATE TABLE "finance_cost_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"project_id" uuid,
	"provider" "finance_cost_provider" NOT NULL,
	"name" text NOT NULL,
	"category" text NOT NULL,
	"state" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"last_synced_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "finance_transactions" ADD COLUMN "cost_source_id" uuid;--> statement-breakpoint
ALTER TABLE "finance_transactions" ADD COLUMN "cost_period" text;--> statement-breakpoint
ALTER TABLE "finance_cost_sources" ADD CONSTRAINT "finance_cost_sources_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_cost_sources" ADD CONSTRAINT "finance_cost_sources_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_transactions" ADD CONSTRAINT "finance_transactions_cost_source_id_finance_cost_sources_id_fk" FOREIGN KEY ("cost_source_id") REFERENCES "public"."finance_cost_sources"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_transactions" ADD CONSTRAINT "finance_transactions_costSourceId_costPeriod_unique" UNIQUE("cost_source_id","cost_period");
ALTER TABLE "activity_settings" ADD COLUMN "games_minutes_per_task" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "finance_wishes" ADD COLUMN "goal_id" uuid;--> statement-breakpoint
ALTER TABLE "finance_wishes" ADD COLUMN "recipient" text;--> statement-breakpoint
ALTER TABLE "finance_wishes" ADD CONSTRAINT "finance_wishes_goal_id_finance_goals_id_fk" FOREIGN KEY ("goal_id") REFERENCES "public"."finance_goals"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "finance_wishes" DROP CONSTRAINT "finance_wishes_goal_id_finance_goals_id_fk";
--> statement-breakpoint
DROP INDEX "finance_wishes_goal_id_index";--> statement-breakpoint
ALTER TABLE "finance_wishes" DROP COLUMN "goal_id";--> statement-breakpoint
DROP TABLE "life_goals" CASCADE;--> statement-breakpoint
DROP TABLE "finance_goal_contributions" CASCADE;--> statement-breakpoint
DROP TABLE "finance_goals" CASCADE;--> statement-breakpoint
-- The trash keeps rows by table name: rows of the tables gone could never be put back.
DELETE FROM trash.rows WHERE table_name IN ('life_goals', 'finance_goal_contributions', 'finance_goals');--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "horizon" text DEFAULT 'normal' NOT NULL;

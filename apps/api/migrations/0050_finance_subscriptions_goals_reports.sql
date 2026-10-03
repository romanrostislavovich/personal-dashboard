CREATE TYPE "public"."finance_recurring_period" AS ENUM('month', 'year');--> statement-breakpoint
CREATE TABLE "finance_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"month" text NOT NULL,
	"summary" text NOT NULL,
	"text" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "finance_reports_userId_month_unique" UNIQUE("user_id","month")
);
--> statement-breakpoint
CREATE TABLE "finance_goal_contributions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"goal_id" uuid NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"note" text,
	"occurred_on" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "finance_recurring_prices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"recurring_payment_id" uuid NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"changed_on" date NOT NULL
);
--> statement-breakpoint
CREATE TABLE "finance_goals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"target" numeric(14, 2) NOT NULL,
	"currency" text NOT NULL,
	"deadline" date,
	"wallet" text,
	"started_on" date NOT NULL,
	"reached_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "finance_subscription_dismissals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"key" text NOT NULL,
	CONSTRAINT "finance_subscription_dismissals_userId_key_unique" UNIQUE("user_id","key")
);
--> statement-breakpoint
ALTER TABLE "finance_recurring_payments" ADD COLUMN "period" "finance_recurring_period" DEFAULT 'month' NOT NULL;--> statement-breakpoint
ALTER TABLE "finance_recurring_payments" ADD COLUMN "month_of_year" smallint;--> statement-breakpoint
ALTER TABLE "finance_recurring_payments" ADD COLUMN "trial_ends_on" date;--> statement-breakpoint
ALTER TABLE "finance_recurring_payments" ADD COLUMN "trial_notified_for" date;--> statement-breakpoint
ALTER TABLE "finance_recurring_payments" ADD COLUMN "noticed_amount" numeric(14, 2);--> statement-breakpoint
ALTER TABLE "finance_reports" ADD CONSTRAINT "finance_reports_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_goal_contributions" ADD CONSTRAINT "finance_goal_contributions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_goal_contributions" ADD CONSTRAINT "finance_goal_contributions_goal_id_finance_goals_id_fk" FOREIGN KEY ("goal_id") REFERENCES "public"."finance_goals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_recurring_prices" ADD CONSTRAINT "finance_recurring_prices_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_recurring_prices" ADD CONSTRAINT "finance_recurring_prices_recurring_payment_id_finance_recurring_payments_id_fk" FOREIGN KEY ("recurring_payment_id") REFERENCES "public"."finance_recurring_payments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_goals" ADD CONSTRAINT "finance_goals_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_subscription_dismissals" ADD CONSTRAINT "finance_subscription_dismissals_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
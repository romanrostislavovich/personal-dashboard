CREATE TYPE "public"."finance_asset_kind" AS ENUM('cash', 'account', 'deposit', 'investment', 'property', 'debt');--> statement-breakpoint
CREATE TABLE "finance_assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"kind" "finance_asset_kind" NOT NULL,
	"amount" numeric(16, 2) NOT NULL,
	"currency" text NOT NULL,
	"liquid" boolean NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "finance_net_worth_days" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"day" date NOT NULL,
	"total" numeric(16, 2) NOT NULL,
	"liquid" numeric(16, 2) NOT NULL,
	"currency" text NOT NULL,
	CONSTRAINT "finance_net_worth_days_userId_day_unique" UNIQUE("user_id","day")
);
--> statement-breakpoint
ALTER TABLE "finance_recurring_payments" ADD COLUMN "contract_started_on" date;--> statement-breakpoint
ALTER TABLE "finance_recurring_payments" ADD COLUMN "contract_months" smallint;--> statement-breakpoint
ALTER TABLE "finance_recurring_payments" ADD COLUMN "notice_days" smallint;--> statement-breakpoint
ALTER TABLE "finance_recurring_payments" ADD COLUMN "auto_renews" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "finance_recurring_payments" ADD COLUMN "price_locked_until" date;--> statement-breakpoint
ALTER TABLE "finance_recurring_payments" ADD COLUMN "dates_notified" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "finance_assets" ADD CONSTRAINT "finance_assets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_net_worth_days" ADD CONSTRAINT "finance_net_worth_days_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "finance_assets_user_id_index" ON "finance_assets" USING btree ("user_id");
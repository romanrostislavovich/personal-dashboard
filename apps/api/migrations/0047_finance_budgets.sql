CREATE TABLE "finance_budgets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"category" text NOT NULL,
	"limit" numeric(14, 2) NOT NULL,
	"warned_month" text,
	"exceeded_month" text,
	CONSTRAINT "finance_budgets_userId_category_unique" UNIQUE("user_id","category")
);
--> statement-breakpoint
ALTER TABLE "finance_budgets" ADD CONSTRAINT "finance_budgets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
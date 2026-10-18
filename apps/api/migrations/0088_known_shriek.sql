ALTER TABLE "finance_bank_accounts" ADD COLUMN "balance" numeric(14, 2);--> statement-breakpoint
ALTER TABLE "finance_bank_accounts" ADD COLUMN "balance_currency" text;--> statement-breakpoint
ALTER TABLE "finance_bank_accounts" ADD COLUMN "balance_at" timestamp with time zone;
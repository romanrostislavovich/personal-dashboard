CREATE TABLE "finance_bank_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"connection_id" uuid NOT NULL,
	"uid" text NOT NULL,
	"iban" text,
	"name" text,
	"currency" text,
	"enabled" boolean DEFAULT false NOT NULL,
	"last_booked_on" date,
	"last_synced_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "finance_bank_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"bank" text NOT NULL,
	"country" text NOT NULL,
	"session_id" text NOT NULL,
	"valid_until" timestamp with time zone,
	"reminded_for" date,
	"last_synced_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "finance_transactions" ADD COLUMN "bank_account_id" uuid;--> statement-breakpoint
ALTER TABLE "finance_transactions" ADD COLUMN "bank_entry_id" text;--> statement-breakpoint
ALTER TABLE "finance_transactions" ADD COLUMN "counterparty" text;--> statement-breakpoint
ALTER TABLE "finance_bank_accounts" ADD CONSTRAINT "finance_bank_accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_bank_accounts" ADD CONSTRAINT "finance_bank_accounts_connection_id_finance_bank_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."finance_bank_connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_bank_connections" ADD CONSTRAINT "finance_bank_connections_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "finance_bank_accounts_user_id_index" ON "finance_bank_accounts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "finance_bank_accounts_connection_id_index" ON "finance_bank_accounts" USING btree ("connection_id");--> statement-breakpoint
CREATE INDEX "finance_bank_connections_user_id_index" ON "finance_bank_connections" USING btree ("user_id");--> statement-breakpoint
ALTER TABLE "finance_transactions" ADD CONSTRAINT "finance_transactions_bank_account_id_finance_bank_accounts_id_fk" FOREIGN KEY ("bank_account_id") REFERENCES "public"."finance_bank_accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_transactions" ADD CONSTRAINT "finance_transactions_userId_bankEntryId_unique" UNIQUE("user_id","bank_entry_id");
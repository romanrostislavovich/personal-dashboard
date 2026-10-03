CREATE TABLE "finance_receipts" (
	"transaction_id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"data" "bytea" NOT NULL,
	"mime_type" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_settings" ADD COLUMN "vision_connection_id" uuid;--> statement-breakpoint
ALTER TABLE "ai_settings" ADD COLUMN "vision_model" text DEFAULT 'gpt-4o-mini' NOT NULL;--> statement-breakpoint
ALTER TABLE "finance_receipts" ADD CONSTRAINT "finance_receipts_transaction_id_finance_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."finance_transactions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_receipts" ADD CONSTRAINT "finance_receipts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_settings" ADD CONSTRAINT "ai_settings_vision_connection_id_ai_connections_id_fk" FOREIGN KEY ("vision_connection_id") REFERENCES "public"."ai_connections"("id") ON DELETE set null ON UPDATE no action;
CREATE SCHEMA "trash";
--> statement-breakpoint
CREATE TABLE "ai_actions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"tool" text NOT NULL,
	"module" text NOT NULL,
	"args" text NOT NULL,
	"outcome" text NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trash"."rows" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" uuid,
	"tx" "xid8" NOT NULL,
	"table_name" text NOT NULL,
	"row" jsonb NOT NULL,
	"deleted_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_settings" ADD COLUMN "disabled_modules" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_actions" ADD CONSTRAINT "ai_actions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_actions_user_id_created_at_index" ON "ai_actions" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "rows_tx_index" ON "trash"."rows" USING btree ("tx");--> statement-breakpoint
CREATE INDEX "rows_user_id_deleted_at_index" ON "trash"."rows" USING btree ("user_id","deleted_at");
CREATE TABLE "notification_outbox" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"source" text NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"actions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"dedupe_key" text NOT NULL,
	"status" text NOT NULL,
	"channels" text[] DEFAULT '{}' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "notification_outbox" ADD CONSTRAINT "notification_outbox_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "notification_outbox_user_id_created_at_index" ON "notification_outbox" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "notification_outbox_user_id_dedupe_key_created_at_index" ON "notification_outbox" USING btree ("user_id","dedupe_key","created_at");--> statement-breakpoint
CREATE INDEX "notification_outbox_status_next_attempt_at_index" ON "notification_outbox" USING btree ("status","next_attempt_at");
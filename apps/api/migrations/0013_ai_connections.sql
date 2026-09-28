CREATE TABLE "ai_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"provider" text NOT NULL,
	"base_url" text NOT NULL,
	"model" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_settings" ADD COLUMN "active_connection_id" uuid;--> statement-breakpoint
ALTER TABLE "ai_connections" ADD CONSTRAINT "ai_connections_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_settings" ADD CONSTRAINT "ai_settings_active_connection_id_ai_connections_id_fk" FOREIGN KEY ("active_connection_id") REFERENCES "public"."ai_connections"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
-- The existing settings become the first connection. Its id is the user id, not a random one:
-- this migration runs on both sync instances, and they must produce the same row (docs/sync.md).
INSERT INTO "ai_connections" ("id", "user_id", "name", "provider", "base_url", "model")
SELECT "user_id", "user_id",
  CASE "provider" WHEN 'deepseek' THEN 'DeepSeek' WHEN 'openai' THEN 'OpenAI' WHEN 'ollama' THEN 'Ollama' ELSE 'AI' END,
  "provider", "base_url", "model"
FROM "ai_settings";--> statement-breakpoint
UPDATE "ai_settings" SET "active_connection_id" = "user_id";--> statement-breakpoint
-- The key moves to the connection; the name is not part of the encryption, so it is a rename.
UPDATE "user_secrets" SET "key" = 'ai.connection.' || "user_id" WHERE "key" = 'ai.api-key';

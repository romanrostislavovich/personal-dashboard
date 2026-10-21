CREATE SCHEMA "search";
--> statement-breakpoint
CREATE TABLE "ai_memories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"text" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "search"."vectors" (
	"user_id" uuid NOT NULL,
	"module" text NOT NULL,
	"item_id" text NOT NULL,
	"model" text NOT NULL,
	"hash" text NOT NULL,
	"vector" real[] NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vectors_user_id_module_item_id_pk" PRIMARY KEY("user_id","module","item_id")
);
--> statement-breakpoint
ALTER TABLE "ai_settings" ADD COLUMN "embedding_connection_id" uuid;--> statement-breakpoint
ALTER TABLE "ai_settings" ADD COLUMN "embedding_model" text DEFAULT 'paraphrase-multilingual' NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_memories" ADD CONSTRAINT "ai_memories_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_memories_user_id_index" ON "ai_memories" USING btree ("user_id");--> statement-breakpoint
ALTER TABLE "ai_settings" ADD CONSTRAINT "ai_settings_embedding_connection_id_ai_connections_id_fk" FOREIGN KEY ("embedding_connection_id") REFERENCES "public"."ai_connections"("id") ON DELETE set null ON UPDATE no action;
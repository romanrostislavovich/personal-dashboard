CREATE TABLE "ai_usage" (
	"user_id" uuid NOT NULL,
	"connection_id" uuid NOT NULL,
	"day" date NOT NULL,
	"model" text NOT NULL,
	"prompt_tokens" integer DEFAULT 0 NOT NULL,
	"completion_tokens" integer DEFAULT 0 NOT NULL,
	"cached_tokens" integer DEFAULT 0 NOT NULL,
	"requests" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "ai_usage_connection_id_day_model_pk" PRIMARY KEY("connection_id","day","model")
);
--> statement-breakpoint
ALTER TABLE "ai_connections" ADD COLUMN "price_input" double precision;--> statement-breakpoint
ALTER TABLE "ai_connections" ADD COLUMN "price_output" double precision;--> statement-breakpoint
ALTER TABLE "ai_connections" ADD COLUMN "monthly_limit" double precision;--> statement-breakpoint
ALTER TABLE "ai_usage" ADD CONSTRAINT "ai_usage_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_usage" ADD CONSTRAINT "ai_usage_connection_id_ai_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."ai_connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_usage_user_id_day_index" ON "ai_usage" USING btree ("user_id","day");
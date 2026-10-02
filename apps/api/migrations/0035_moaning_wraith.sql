CREATE TABLE "code_account_days" (
	"user_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"day" date NOT NULL,
	"count" integer NOT NULL,
	"commits" integer DEFAULT 0 NOT NULL,
	"pull_requests" integer DEFAULT 0 NOT NULL,
	"reviews" integer DEFAULT 0 NOT NULL,
	"issues" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "code_account_days_user_id_provider_day_pk" PRIMARY KEY("user_id","provider","day")
);
--> statement-breakpoint
CREATE TABLE "code_accounts" (
	"user_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"login" text NOT NULL,
	"name" text,
	"avatar_url" text,
	"html_url" text NOT NULL,
	"joined_at" timestamp with time zone NOT NULL,
	"followers" integer,
	"following" integer,
	"repos" integer NOT NULL,
	"total_stars" integer,
	"languages" jsonb NOT NULL,
	"top_repos" jsonb NOT NULL,
	"last_synced_at" timestamp with time zone,
	"sync_error" text,
	CONSTRAINT "code_accounts_user_id_provider_pk" PRIMARY KEY("user_id","provider")
);
--> statement-breakpoint
ALTER TABLE "code_account_days" ADD CONSTRAINT "code_account_days_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "code_accounts" ADD CONSTRAINT "code_accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
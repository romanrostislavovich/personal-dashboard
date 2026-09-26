CREATE TABLE "user_secrets" (
	"user_id" uuid NOT NULL,
	"key" text NOT NULL,
	"encrypted_value" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_secrets_user_id_key_pk" PRIMARY KEY("user_id","key")
);
--> statement-breakpoint
CREATE TABLE "github_repo_daily_stats" (
	"repo_id" uuid NOT NULL,
	"day" date NOT NULL,
	"stars" integer NOT NULL,
	"forks" integer NOT NULL,
	"open_issues" integer NOT NULL,
	"open_pulls" integer NOT NULL,
	"npm_weekly_downloads" integer,
	CONSTRAINT "github_repo_daily_stats_repo_id_day_pk" PRIMARY KEY("repo_id","day")
);
--> statement-breakpoint
CREATE TABLE "github_tracked_repos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"full_name" text NOT NULL,
	"npm_package" text,
	"html_url" text NOT NULL,
	"description" text,
	"stars" integer DEFAULT 0 NOT NULL,
	"forks" integer DEFAULT 0 NOT NULL,
	"open_issues" integer DEFAULT 0 NOT NULL,
	"open_pulls" integer DEFAULT 0 NOT NULL,
	"npm_weekly_downloads" integer,
	"latest_release_tag" text,
	"latest_release_at" timestamp with time zone,
	"pushed_at" timestamp with time zone,
	"last_synced_at" timestamp with time zone,
	"sync_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "github_tracked_repos_userId_fullName_unique" UNIQUE("user_id","full_name")
);
--> statement-breakpoint
ALTER TABLE "user_secrets" ADD CONSTRAINT "user_secrets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "github_repo_daily_stats" ADD CONSTRAINT "github_repo_daily_stats_repo_id_github_tracked_repos_id_fk" FOREIGN KEY ("repo_id") REFERENCES "public"."github_tracked_repos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "github_tracked_repos" ADD CONSTRAINT "github_tracked_repos_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
CREATE TABLE "github_contribution_days" (
	"user_id" uuid NOT NULL,
	"day" date NOT NULL,
	"count" integer NOT NULL,
	CONSTRAINT "github_contribution_days_user_id_day_pk" PRIMARY KEY("user_id","day")
);
--> statement-breakpoint
CREATE TABLE "github_contribution_years" (
	"user_id" uuid NOT NULL,
	"year" integer NOT NULL,
	"contributions" integer NOT NULL,
	"commits" integer NOT NULL,
	"pull_requests" integer NOT NULL,
	"reviews" integer NOT NULL,
	"issues" integer NOT NULL,
	"restricted" integer NOT NULL,
	CONSTRAINT "github_contribution_years_user_id_year_pk" PRIMARY KEY("user_id","year")
);
--> statement-breakpoint
CREATE TABLE "github_profile_daily_stats" (
	"user_id" uuid NOT NULL,
	"day" date NOT NULL,
	"followers" integer NOT NULL,
	"repos" integer NOT NULL,
	"total_stars" integer NOT NULL,
	CONSTRAINT "github_profile_daily_stats_user_id_day_pk" PRIMARY KEY("user_id","day")
);
--> statement-breakpoint
CREATE TABLE "github_profiles" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"login" text NOT NULL,
	"name" text,
	"avatar_url" text NOT NULL,
	"html_url" text NOT NULL,
	"joined_at" timestamp with time zone NOT NULL,
	"followers" integer NOT NULL,
	"following" integer NOT NULL,
	"repos" integer NOT NULL,
	"total_stars" integer NOT NULL,
	"languages" jsonb NOT NULL,
	"top_repos" jsonb NOT NULL,
	"last_synced_at" timestamp with time zone,
	"sync_error" text
);
--> statement-breakpoint
ALTER TABLE "ai_settings" ADD COLUMN "digest_opt_ins" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "github_contribution_days" ADD CONSTRAINT "github_contribution_days_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "github_contribution_years" ADD CONSTRAINT "github_contribution_years_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "github_profile_daily_stats" ADD CONSTRAINT "github_profile_daily_stats_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "github_profiles" ADD CONSTRAINT "github_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
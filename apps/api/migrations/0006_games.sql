CREATE TYPE "public"."games_game" AS ENUM('dota2', 'wow');--> statement-breakpoint
CREATE TABLE "games_dota_matches" (
	"account_id" uuid NOT NULL,
	"match_id" bigint NOT NULL,
	"hero_id" integer NOT NULL,
	"won" boolean NOT NULL,
	"kills" integer NOT NULL,
	"deaths" integer NOT NULL,
	"assists" integer NOT NULL,
	"duration_sec" integer NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	CONSTRAINT "games_dota_matches_account_id_match_id_pk" PRIMARY KEY("account_id","match_id")
);
--> statement-breakpoint
CREATE TABLE "games_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"game" "games_game" NOT NULL,
	"external_id" text NOT NULL,
	"display_name" text NOT NULL,
	"profile" jsonb,
	"last_synced_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "games_accounts_userId_game_externalId_unique" UNIQUE("user_id","game","external_id")
);
--> statement-breakpoint
CREATE TABLE "games_wow_achievements" (
	"account_id" uuid NOT NULL,
	"achievement_id" integer NOT NULL,
	"name" text NOT NULL,
	"completed_at" timestamp with time zone NOT NULL,
	CONSTRAINT "games_wow_achievements_account_id_achievement_id_pk" PRIMARY KEY("account_id","achievement_id")
);
--> statement-breakpoint
ALTER TABLE "games_dota_matches" ADD CONSTRAINT "games_dota_matches_account_id_games_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."games_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "games_accounts" ADD CONSTRAINT "games_accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "games_wow_achievements" ADD CONSTRAINT "games_wow_achievements_account_id_games_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."games_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "games_dota_matches_account_id_started_at_index" ON "games_dota_matches" USING btree ("account_id","started_at");
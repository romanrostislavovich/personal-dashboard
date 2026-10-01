ALTER TYPE "public"."games_game" ADD VALUE 'steam';--> statement-breakpoint
CREATE TABLE "games_steam_games" (
	"account_id" uuid NOT NULL,
	"app_id" integer NOT NULL,
	"name" text NOT NULL,
	"icon_hash" text,
	"playtime_minutes" integer DEFAULT 0 NOT NULL,
	"playtime2_weeks_minutes" integer DEFAULT 0 NOT NULL,
	"last_played_at" timestamp with time zone,
	"achievements_unlocked" integer,
	"achievements_total" integer,
	"achievements_playtime" integer,
	CONSTRAINT "games_steam_games_account_id_app_id_pk" PRIMARY KEY("account_id","app_id")
);
--> statement-breakpoint
ALTER TABLE "games_steam_games" ADD CONSTRAINT "games_steam_games_account_id_games_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."games_accounts"("id") ON DELETE cascade ON UPDATE no action;
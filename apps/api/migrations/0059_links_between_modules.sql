CREATE TABLE "games_steam_play_days" (
	"user_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"app_id" integer NOT NULL,
	"day" date NOT NULL,
	"minutes" integer NOT NULL,
	CONSTRAINT "games_steam_play_days_account_id_app_id_day_pk" PRIMARY KEY("account_id","app_id","day")
);
--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "aliases" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "games_steam_play_days" ADD CONSTRAINT "games_steam_play_days_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "games_steam_play_days" ADD CONSTRAINT "games_steam_play_days_account_id_games_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."games_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "games_steam_play_days_user_id_day_index" ON "games_steam_play_days" USING btree ("user_id","day");
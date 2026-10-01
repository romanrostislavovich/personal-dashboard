ALTER TABLE "games_dota_matches" ALTER COLUMN "won" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "games_dota_matches" ALTER COLUMN "kills" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "games_dota_matches" ALTER COLUMN "deaths" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "games_dota_matches" ALTER COLUMN "assists" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "games_dota_matches" ALTER COLUMN "duration_sec" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "games_dota_matches" ADD COLUMN "details_checked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "games_accounts" ADD COLUMN "steam_history_synced_at" timestamp with time zone;
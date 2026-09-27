ALTER TABLE "games_dota_matches" ADD COLUMN "game_mode" integer;--> statement-breakpoint
ALTER TABLE "games_dota_matches" ADD COLUMN "lobby_type" integer;--> statement-breakpoint
ALTER TABLE "games_dota_matches" ADD COLUMN "party_size" integer;--> statement-breakpoint
ALTER TABLE "games_dota_matches" ADD COLUMN "gold_per_min" integer;--> statement-breakpoint
ALTER TABLE "games_dota_matches" ADD COLUMN "xp_per_min" integer;--> statement-breakpoint
ALTER TABLE "games_dota_matches" ADD COLUMN "last_hits" integer;--> statement-breakpoint
ALTER TABLE "games_dota_matches" ADD COLUMN "denies" integer;--> statement-breakpoint
ALTER TABLE "games_dota_matches" ADD COLUMN "hero_damage" integer;--> statement-breakpoint
ALTER TABLE "games_dota_matches" ADD COLUMN "tower_damage" integer;--> statement-breakpoint
ALTER TABLE "games_dota_matches" ADD COLUMN "hero_healing" integer;--> statement-breakpoint
ALTER TABLE "games_dota_matches" ADD COLUMN "leaver_status" integer;--> statement-breakpoint
ALTER TABLE "games_accounts" ADD COLUMN "history_synced_at" timestamp with time zone;
-- The `github-oss` module became a subsection of `development`: move what was stored under its id.
-- Rows whose id is part of the primary key are copied and the old ones deleted (not updated), so
-- an instance that got the new rows by sync before running this migration does not clash.
-- The old rows are not something the user deleted: keep them out of the trash.
SELECT set_config('pd.trash_off', 'on', true);
--> statement-breakpoint
INSERT INTO "user_secrets" ("user_id", "key", "encrypted_value", "updated_at")
SELECT "user_id", 'development.github-token', "encrypted_value", "updated_at"
FROM "user_secrets" WHERE "key" = 'github-oss.token'
ON CONFLICT DO NOTHING;
--> statement-breakpoint
DELETE FROM "user_secrets" WHERE "key" = 'github-oss.token';
--> statement-breakpoint
INSERT INTO "achievements_unlocked" ("user_id", "achievement_id", "unlocked_at")
SELECT "user_id", 'development.' || substr("achievement_id", length('github-oss.') + 1), "unlocked_at"
FROM "achievements_unlocked" WHERE "achievement_id" LIKE 'github-oss.%'
ON CONFLICT DO NOTHING;
--> statement-breakpoint
DELETE FROM "achievements_unlocked" WHERE "achievement_id" LIKE 'github-oss.%';
--> statement-breakpoint
INSERT INTO "morning_digest_snapshots" ("user_id", "section_id", "facts", "sent_at")
SELECT "user_id", 'development.repos', "facts", "sent_at"
FROM "morning_digest_snapshots" WHERE "section_id" = 'github-oss.repos'
ON CONFLICT DO NOTHING;
--> statement-breakpoint
DELETE FROM "morning_digest_snapshots" WHERE "section_id" = 'github-oss.repos';
--> statement-breakpoint
UPDATE "ai_settings" SET "disabled_modules" = array_replace("disabled_modules", 'github-oss', 'development')
WHERE 'github-oss' = ANY("disabled_modules");
--> statement-breakpoint
UPDATE "ai_actions" SET "module" = 'development' WHERE "module" = 'github-oss';
--> statement-breakpoint
-- The hourly job is now `development.repo-sync`; drop the old schedule so pg-boss stops queueing it.
DO $$
BEGIN
  IF to_regclass('pgboss.schedule') IS NOT NULL THEN
    DELETE FROM pgboss.schedule WHERE name = 'github-oss.sync';
  END IF;
END $$;
--> statement-breakpoint
SELECT set_config('pd.trash_off', 'off', true);

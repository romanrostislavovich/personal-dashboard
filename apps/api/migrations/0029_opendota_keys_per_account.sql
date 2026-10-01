-- An OpenDota key now belongs to a Dota account, not to the user: the key saved so far goes to
-- every Dota account the user has (the value is encrypted and is copied as it is).
INSERT INTO "user_secrets" ("user_id", "key", "encrypted_value", "updated_at")
SELECT s."user_id", 'games.opendota-key.' || a."id", s."encrypted_value", s."updated_at"
FROM "user_secrets" s
JOIN "games_accounts" a ON a."user_id" = s."user_id" AND a."game" = 'dota2'
WHERE s."key" = 'games.opendota-key'
ON CONFLICT DO NOTHING;
--> statement-breakpoint
DELETE FROM "user_secrets" WHERE "key" = 'games.opendota-key';

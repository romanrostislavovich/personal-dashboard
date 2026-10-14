ALTER TABLE "diary_entries" ADD COLUMN "words" integer DEFAULT 0 NOT NULL;
-- The words of the entries written so far are counted when they are encrypted, on the server
-- (EncryptExistingService): an UPDATE here would run on a sync client too and send its old,
-- plain rows back over the encrypted ones.

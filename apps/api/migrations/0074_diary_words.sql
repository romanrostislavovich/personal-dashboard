ALTER TABLE "diary_entries" ADD COLUMN "words" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
-- The words of the entries written so far, counted while their text is still plain; from now on
-- they are counted on save (the text becomes encrypted).
UPDATE "diary_entries" SET "words" = CASE WHEN btrim("content") = '' THEN 0
  ELSE array_length(regexp_split_to_array(btrim("content"), '\s+'), 1) END
  WHERE "content" NOT LIKE 'enc:v1:%';

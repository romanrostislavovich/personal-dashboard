CREATE TABLE "diary_photos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"day" date NOT NULL,
	"mime_type" text NOT NULL,
	"size" integer NOT NULL,
	"caption" text,
	"data" "bytea" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "diary_entries" ADD COLUMN "marks" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "diary_settings" ADD COLUMN "template" text;--> statement-breakpoint
ALTER TABLE "diary_photos" ADD CONSTRAINT "diary_photos_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "diary_photos_user_id_day_index" ON "diary_photos" USING btree ("user_id","day");
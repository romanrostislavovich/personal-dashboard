CREATE TABLE "music_settings" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"lastfm_username" text,
	"last_synced_at" timestamp with time zone,
	"last_error" text
);
--> statement-breakpoint
CREATE TABLE "music_scrobbles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"played_at" timestamp with time zone NOT NULL,
	"artist" text NOT NULL,
	"track" text NOT NULL,
	"album" text,
	CONSTRAINT "music_scrobbles_userId_playedAt_track_unique" UNIQUE("user_id","played_at","track")
);
--> statement-breakpoint
ALTER TABLE "music_settings" ADD CONSTRAINT "music_settings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "music_scrobbles" ADD CONSTRAINT "music_scrobbles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "music_scrobbles_user_id_played_at_index" ON "music_scrobbles" USING btree ("user_id","played_at");
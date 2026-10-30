CREATE TABLE "music_artist_genres" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"artist" text NOT NULL,
	"genres" text[] NOT NULL,
	"read_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "music_artist_genres_userId_artist_unique" UNIQUE("user_id","artist")
);
--> statement-breakpoint
ALTER TABLE "music_artist_genres" ADD CONSTRAINT "music_artist_genres_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
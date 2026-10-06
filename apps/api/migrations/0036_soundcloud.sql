CREATE TABLE "music_soundcloud_account_days" (
	"user_id" uuid NOT NULL,
	"day" date NOT NULL,
	"followers" integer NOT NULL,
	CONSTRAINT "music_soundcloud_account_days_user_id_day_pk" PRIMARY KEY("user_id","day")
);
--> statement-breakpoint
CREATE TABLE "music_soundcloud_accounts" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"soundcloud_id" text NOT NULL,
	"username" text NOT NULL,
	"display_name" text,
	"avatar_url" text,
	"permalink_url" text NOT NULL,
	"followers" integer DEFAULT 0 NOT NULL,
	"last_synced_at" timestamp with time zone,
	"last_error" text
);
--> statement-breakpoint
CREATE TABLE "music_soundcloud_track_days" (
	"track_id" uuid NOT NULL,
	"day" date NOT NULL,
	"plays" integer NOT NULL,
	"likes" integer NOT NULL,
	"reposts" integer NOT NULL,
	"comments" integer NOT NULL,
	CONSTRAINT "music_soundcloud_track_days_track_id_day_pk" PRIMARY KEY("track_id","day")
);
--> statement-breakpoint
CREATE TABLE "music_soundcloud_tracks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"soundcloud_id" text NOT NULL,
	"title" text NOT NULL,
	"permalink_url" text NOT NULL,
	"artwork_url" text,
	"is_private" boolean DEFAULT false NOT NULL,
	"published_at" timestamp with time zone NOT NULL,
	"duration_ms" integer DEFAULT 0 NOT NULL,
	"genre" text,
	"plays" integer DEFAULT 0 NOT NULL,
	"likes" integer DEFAULT 0 NOT NULL,
	"reposts" integer DEFAULT 0 NOT NULL,
	"comments" integer DEFAULT 0 NOT NULL,
	"downloads" integer DEFAULT 0 NOT NULL,
	"notify" boolean DEFAULT true NOT NULL,
	CONSTRAINT "music_soundcloud_tracks_userId_soundcloudId_unique" UNIQUE("user_id","soundcloud_id")
);
--> statement-breakpoint
ALTER TABLE "music_soundcloud_account_days" ADD CONSTRAINT "music_soundcloud_account_days_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "music_soundcloud_accounts" ADD CONSTRAINT "music_soundcloud_accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "music_soundcloud_track_days" ADD CONSTRAINT "music_soundcloud_track_days_track_id_music_soundcloud_tracks_id_fk" FOREIGN KEY ("track_id") REFERENCES "public"."music_soundcloud_tracks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "music_soundcloud_tracks" ADD CONSTRAINT "music_soundcloud_tracks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
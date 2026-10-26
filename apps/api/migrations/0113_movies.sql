CREATE TABLE "movies_settings" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"track" boolean DEFAULT true NOT NULL,
	"ignored_sites" text[] DEFAULT '{}' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "movies_titles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"tmdb_id" integer,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"original_title" text,
	"year" integer,
	"poster_path" text,
	"genres" text[] DEFAULT '{}' NOT NULL,
	"runtime_minutes" integer,
	"wanted_at" timestamp with time zone,
	"watched_on" date,
	"rating" integer,
	"note" text,
	"match_keys" text[] DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "movies_titles_userId_tmdbId_unique" UNIQUE("user_id","tmdb_id")
);
--> statement-breakpoint
CREATE TABLE "movies_views" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"title_id" uuid,
	"kind" text NOT NULL,
	"site" text NOT NULL,
	"name" text NOT NULL,
	"hints" text NOT NULL,
	"season" integer,
	"episode" integer,
	"started_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone NOT NULL,
	"watched_seconds" integer NOT NULL,
	"position_seconds" double precision NOT NULL,
	"duration_seconds" double precision,
	"dismissed" boolean DEFAULT false NOT NULL,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "movies_settings" ADD CONSTRAINT "movies_settings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movies_titles" ADD CONSTRAINT "movies_titles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movies_views" ADD CONSTRAINT "movies_views_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movies_views" ADD CONSTRAINT "movies_views_title_id_movies_titles_id_fk" FOREIGN KEY ("title_id") REFERENCES "public"."movies_titles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "movies_views_user_id_started_at_index" ON "movies_views" USING btree ("user_id","started_at");--> statement-breakpoint
CREATE INDEX "movies_views_title_id_index" ON "movies_views" USING btree ("title_id");--> statement-breakpoint
CREATE INDEX "movies_views_resolved_at_index" ON "movies_views" USING btree ("resolved_at");
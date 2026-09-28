CREATE TABLE "weather_locations" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"region" text,
	"country" text,
	"latitude" double precision NOT NULL,
	"longitude" double precision NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "weather_locations" ADD CONSTRAINT "weather_locations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
CREATE TABLE "activity_place_presence" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"place_id" uuid,
	"changed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "activity_place_presence_userId_unique" UNIQUE("user_id")
);
--> statement-breakpoint
ALTER TABLE "activity_place_presence" ADD CONSTRAINT "activity_place_presence_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_place_presence" ADD CONSTRAINT "activity_place_presence_place_id_activity_places_id_fk" FOREIGN KEY ("place_id") REFERENCES "public"."activity_places"("id") ON DELETE set null ON UPDATE no action;
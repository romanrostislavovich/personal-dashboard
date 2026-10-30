CREATE TABLE "activity_place_questions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"point" text NOT NULL,
	"stay_start" timestamp with time zone NOT NULL,
	"stay_end" timestamp with time zone NOT NULL,
	"offered" text NOT NULL,
	"answered_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "activity_place_questions" ADD CONSTRAINT "activity_place_questions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "activity_place_questions_user_id_stay_start_index" ON "activity_place_questions" USING btree ("user_id","stay_start");
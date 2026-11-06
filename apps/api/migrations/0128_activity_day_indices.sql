CREATE TABLE "activity_day_indices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"day" date NOT NULL,
	"key" text NOT NULL,
	"value" real NOT NULL,
	CONSTRAINT "activity_day_indices_userId_day_key_unique" UNIQUE("user_id","day","key")
);
--> statement-breakpoint
ALTER TABLE "activity_day_indices" ADD CONSTRAINT "activity_day_indices_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
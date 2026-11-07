CREATE TABLE "activity_hour_values" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"day" date NOT NULL,
	"hour" smallint NOT NULL,
	"key" text NOT NULL,
	"value" real NOT NULL,
	CONSTRAINT "activity_hour_values_userId_day_hour_key_unique" UNIQUE("user_id","day","hour","key")
);
--> statement-breakpoint
ALTER TABLE "activity_hour_values" ADD CONSTRAINT "activity_hour_values_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
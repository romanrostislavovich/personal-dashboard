CREATE TABLE "life_months" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"month" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "life_months" ADD CONSTRAINT "life_months_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
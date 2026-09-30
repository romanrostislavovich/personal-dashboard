CREATE TABLE "finance_settings" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"main_currency" text
);
--> statement-breakpoint
ALTER TABLE "finance_settings" ADD CONSTRAINT "finance_settings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
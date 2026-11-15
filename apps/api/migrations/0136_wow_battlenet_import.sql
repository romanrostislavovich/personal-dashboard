CREATE TABLE "games_wow_dismissed_characters" (
	"user_id" uuid NOT NULL,
	"blizzard_key" text NOT NULL,
	"dismissed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "games_wow_dismissed_characters_user_id_blizzard_key_pk" PRIMARY KEY("user_id","blizzard_key")
);
--> statement-breakpoint
ALTER TABLE "games_accounts" ADD COLUMN "blizzard_key" text;--> statement-breakpoint
ALTER TABLE "games_accounts" ADD COLUMN "not_on_account_since" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "games_wow_dismissed_characters" ADD CONSTRAINT "games_wow_dismissed_characters_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
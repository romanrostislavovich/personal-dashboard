CREATE TABLE "games_wow_days" (
	"account_id" uuid NOT NULL,
	"day" date NOT NULL,
	"item_level" integer,
	"mythic_rating" integer,
	"achievement_points" integer,
	"mounts" integer,
	"pets" integer,
	"toys" integer,
	CONSTRAINT "games_wow_days_account_id_day_pk" PRIMARY KEY("account_id","day")
);
--> statement-breakpoint
CREATE TABLE "games_wow_details" (
	"account_id" uuid PRIMARY KEY NOT NULL,
	"details" jsonb NOT NULL,
	"notify" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "games_wow_token_days" (
	"user_id" uuid NOT NULL,
	"region" text NOT NULL,
	"day" date NOT NULL,
	"price" integer NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "games_wow_token_days_user_id_region_day_pk" PRIMARY KEY("user_id","region","day")
);
--> statement-breakpoint
ALTER TABLE "games_wow_days" ADD CONSTRAINT "games_wow_days_account_id_games_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."games_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "games_wow_details" ADD CONSTRAINT "games_wow_details_account_id_games_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."games_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "games_wow_token_days" ADD CONSTRAINT "games_wow_token_days_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
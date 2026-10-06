CREATE TABLE "life_goals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"year" smallint NOT NULL,
	"title" text NOT NULL,
	"metric" text,
	"target" numeric(16, 2) NOT NULL,
	"direction" text DEFAULT 'atLeast' NOT NULL,
	"manual_value" numeric(16, 2) DEFAULT 0 NOT NULL,
	"reached_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "life_stories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"period" text NOT NULL,
	"text" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "life_stories_userId_period_unique" UNIQUE("user_id","period")
);
--> statement-breakpoint
ALTER TABLE "life_months" ADD COLUMN "year" text;--> statement-breakpoint
ALTER TABLE "life_goals" ADD CONSTRAINT "life_goals_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "life_stories" ADD CONSTRAINT "life_stories_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
CREATE TABLE "links_change_points" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"key" text NOT NULL,
	"module" text NOT NULL,
	"label_key" text NOT NULL,
	"label" text,
	"unit" text NOT NULL,
	"currency" text,
	"extra" boolean DEFAULT false NOT NULL,
	"outcome" boolean DEFAULT false NOT NULL,
	"day" date NOT NULL,
	"before" real NOT NULL,
	"after" real NOT NULL,
	"effect" real NOT NULL,
	"notified_at" timestamp with time zone,
	CONSTRAINT "links_change_points_userId_key_day_unique" UNIQUE("user_id","key","day")
);
--> statement-breakpoint
CREATE TABLE "links_seen" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"key" text NOT NULL,
	"seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "links_seen_userId_kind_key_unique" UNIQUE("user_id","kind","key")
);
--> statement-breakpoint
ALTER TABLE "links_change_points" ADD CONSTRAINT "links_change_points_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "links_seen" ADD CONSTRAINT "links_seen_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
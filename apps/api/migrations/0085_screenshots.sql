CREATE TABLE "screenshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"mime_type" text NOT NULL,
	"size" integer NOT NULL,
	"width" integer,
	"height" integer,
	"hash" text NOT NULL,
	"data" "bytea" NOT NULL,
	"thumbnail" "bytea",
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "screenshots_userId_name_unique" UNIQUE("user_id","name")
);
--> statement-breakpoint
ALTER TABLE "screenshots" ADD CONSTRAINT "screenshots_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "screenshots_user_id_created_at_index" ON "screenshots" USING btree ("user_id","created_at");
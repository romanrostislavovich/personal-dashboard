CREATE TABLE "finance_wish_prices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"wish_id" uuid NOT NULL,
	"day" date NOT NULL,
	"price" numeric(14, 2) NOT NULL,
	"currency" text NOT NULL,
	CONSTRAINT "finance_wish_prices_wishId_day_unique" UNIQUE("wish_id","day")
);
--> statement-breakpoint
CREATE TABLE "finance_wishes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"url" text NOT NULL,
	"name" text NOT NULL,
	"note" text,
	"image_url" text,
	"price" numeric(14, 2),
	"currency" text,
	"previous_price" numeric(14, 2),
	"checked_at" timestamp with time zone,
	"check_error" text,
	"bought_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "finance_wish_prices" ADD CONSTRAINT "finance_wish_prices_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_wish_prices" ADD CONSTRAINT "finance_wish_prices_wish_id_finance_wishes_id_fk" FOREIGN KEY ("wish_id") REFERENCES "public"."finance_wishes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_wishes" ADD CONSTRAINT "finance_wishes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
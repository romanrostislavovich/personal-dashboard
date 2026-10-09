CREATE TABLE "integration_alerts" (
	"user_id" uuid NOT NULL,
	"integration_id" text NOT NULL,
	"state" text NOT NULL,
	"told_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "integration_alerts_user_id_integration_id_pk" PRIMARY KEY("user_id","integration_id")
);
--> statement-breakpoint
ALTER TABLE "integration_alerts" ADD CONSTRAINT "integration_alerts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
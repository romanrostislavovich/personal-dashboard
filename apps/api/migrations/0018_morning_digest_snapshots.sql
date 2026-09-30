CREATE TABLE "morning_digest_snapshots" (
	"user_id" uuid NOT NULL,
	"section_id" text NOT NULL,
	"facts" jsonb NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "morning_digest_snapshots_user_id_section_id_pk" PRIMARY KEY("user_id","section_id")
);
--> statement-breakpoint
ALTER TABLE "morning_digest_snapshots" ADD CONSTRAINT "morning_digest_snapshots_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
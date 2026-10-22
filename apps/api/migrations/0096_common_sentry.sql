CREATE TABLE "wakatime_spans" (
	"user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"name" text NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone NOT NULL,
	"day" date NOT NULL,
	CONSTRAINT "wakatime_spans_user_id_kind_name_started_at_pk" PRIMARY KEY("user_id","kind","name","started_at")
);
--> statement-breakpoint
ALTER TABLE "wakatime_spans" ADD CONSTRAINT "wakatime_spans_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "wakatime_spans_user_id_started_at_index" ON "wakatime_spans" USING btree ("user_id","started_at");
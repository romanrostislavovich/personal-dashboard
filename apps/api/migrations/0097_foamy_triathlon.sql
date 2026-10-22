CREATE TABLE "activity_rule_suggestions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"pattern" text NOT NULL,
	"kind" text NOT NULL,
	"seconds" integer NOT NULL,
	"reason" text,
	"rejected" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "activity_rule_suggestions_userId_projectId_pattern_unique" UNIQUE("user_id","project_id","pattern")
);
--> statement-breakpoint
ALTER TABLE "activity_rule_suggestions" ADD CONSTRAINT "activity_rule_suggestions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_rule_suggestions" ADD CONSTRAINT "activity_rule_suggestions_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "activity_rule_suggestions_project_id_index" ON "activity_rule_suggestions" USING btree ("project_id");
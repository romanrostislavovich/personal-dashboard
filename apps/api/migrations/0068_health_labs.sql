CREATE TABLE "health_lab_panels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"taken_on" date NOT NULL,
	"laboratory" text,
	"country" text,
	"visit_id" uuid,
	"document_id" uuid,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "health_lab_values" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"panel_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"name" text NOT NULL,
	"analyte" text,
	"value" double precision,
	"text_value" text,
	"unit" text,
	"ref_low" double precision,
	"ref_high" double precision,
	"ref_text" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "health_studies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"area" text,
	"performed_on" date NOT NULL,
	"conclusion" text,
	"visit_id" uuid,
	"document_id" uuid,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "health_lab_panels" ADD CONSTRAINT "health_lab_panels_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "health_lab_panels" ADD CONSTRAINT "health_lab_panels_visit_id_health_visits_id_fk" FOREIGN KEY ("visit_id") REFERENCES "public"."health_visits"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "health_lab_panels" ADD CONSTRAINT "health_lab_panels_document_id_health_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."health_documents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "health_lab_values" ADD CONSTRAINT "health_lab_values_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "health_lab_values" ADD CONSTRAINT "health_lab_values_panel_id_health_lab_panels_id_fk" FOREIGN KEY ("panel_id") REFERENCES "public"."health_lab_panels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "health_studies" ADD CONSTRAINT "health_studies_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "health_studies" ADD CONSTRAINT "health_studies_visit_id_health_visits_id_fk" FOREIGN KEY ("visit_id") REFERENCES "public"."health_visits"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "health_studies" ADD CONSTRAINT "health_studies_document_id_health_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."health_documents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "health_lab_panels_user_id_taken_on_index" ON "health_lab_panels" USING btree ("user_id","taken_on");--> statement-breakpoint
CREATE INDEX "health_lab_values_panel_id_index" ON "health_lab_values" USING btree ("panel_id");--> statement-breakpoint
CREATE INDEX "health_lab_values_user_id_analyte_index" ON "health_lab_values" USING btree ("user_id","analyte");--> statement-breakpoint
CREATE INDEX "health_studies_user_id_performed_on_index" ON "health_studies" USING btree ("user_id","performed_on");
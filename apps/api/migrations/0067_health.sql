CREATE TABLE "health_clinics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"country" text,
	"city" text,
	"contacts" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "health_diagnoses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"system" text NOT NULL,
	"code" text,
	"title" text NOT NULL,
	"status" text NOT NULL,
	"diagnosed_on" date NOT NULL,
	"visit_id" uuid,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "health_doctors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"speciality" text,
	"clinic_id" uuid,
	"contacts" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "health_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"documented_on" date,
	"visit_id" uuid,
	"mime_type" text NOT NULL,
	"size" integer NOT NULL,
	"data" "bytea" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "health_icd_codes" (
	"user_id" uuid NOT NULL,
	"system" text NOT NULL,
	"language" text NOT NULL,
	"code" text NOT NULL,
	"title" text NOT NULL,
	CONSTRAINT "health_icd_codes_user_id_system_language_code_pk" PRIMARY KEY("user_id","system","language","code")
);
--> statement-breakpoint
CREATE TABLE "health_medications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"substance" text,
	"dose" text,
	"schedule" text,
	"started_on" date,
	"stopped_on" date,
	"stop_reason" text,
	"visit_id" uuid,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "health_visits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"visited_on" date NOT NULL,
	"clinic_id" uuid,
	"doctor_id" uuid,
	"speciality" text,
	"country" text,
	"complaints" text,
	"findings" text,
	"recommendations" text,
	"notes" text,
	"next_visit_on" date,
	"language" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "health_clinics" ADD CONSTRAINT "health_clinics_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "health_diagnoses" ADD CONSTRAINT "health_diagnoses_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "health_diagnoses" ADD CONSTRAINT "health_diagnoses_visit_id_health_visits_id_fk" FOREIGN KEY ("visit_id") REFERENCES "public"."health_visits"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "health_doctors" ADD CONSTRAINT "health_doctors_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "health_doctors" ADD CONSTRAINT "health_doctors_clinic_id_health_clinics_id_fk" FOREIGN KEY ("clinic_id") REFERENCES "public"."health_clinics"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "health_documents" ADD CONSTRAINT "health_documents_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "health_documents" ADD CONSTRAINT "health_documents_visit_id_health_visits_id_fk" FOREIGN KEY ("visit_id") REFERENCES "public"."health_visits"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "health_icd_codes" ADD CONSTRAINT "health_icd_codes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "health_medications" ADD CONSTRAINT "health_medications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "health_medications" ADD CONSTRAINT "health_medications_visit_id_health_visits_id_fk" FOREIGN KEY ("visit_id") REFERENCES "public"."health_visits"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "health_visits" ADD CONSTRAINT "health_visits_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "health_visits" ADD CONSTRAINT "health_visits_clinic_id_health_clinics_id_fk" FOREIGN KEY ("clinic_id") REFERENCES "public"."health_clinics"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "health_visits" ADD CONSTRAINT "health_visits_doctor_id_health_doctors_id_fk" FOREIGN KEY ("doctor_id") REFERENCES "public"."health_doctors"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "health_clinics_user_id_index" ON "health_clinics" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "health_diagnoses_user_id_code_index" ON "health_diagnoses" USING btree ("user_id","code");--> statement-breakpoint
CREATE INDEX "health_doctors_user_id_index" ON "health_doctors" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "health_documents_user_id_index" ON "health_documents" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "health_medications_user_id_index" ON "health_medications" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "health_visits_user_id_visited_on_index" ON "health_visits" USING btree ("user_id","visited_on");
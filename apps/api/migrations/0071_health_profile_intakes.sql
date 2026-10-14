CREATE TABLE "health_allergies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"substance" text NOT NULL,
	"reaction" text,
	"severity" text,
	"since" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "health_intakes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"medication_id" uuid NOT NULL,
	"day" date NOT NULL,
	"time" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"answered_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "health_intakes_medicationId_day_time_unique" UNIQUE("medication_id","day","time")
);
--> statement-breakpoint
CREATE TABLE "health_operations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"title" text NOT NULL,
	"performed_on" date NOT NULL,
	"clinic" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "health_profiles" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"blood_type" text,
	"notes" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "health_vaccinations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"vaccine" text NOT NULL,
	"dose" text,
	"given_on" date NOT NULL,
	"country" text,
	"next_due_on" date,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "health_medications" ADD COLUMN "reminder_times" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "health_allergies" ADD CONSTRAINT "health_allergies_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "health_intakes" ADD CONSTRAINT "health_intakes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "health_intakes" ADD CONSTRAINT "health_intakes_medication_id_health_medications_id_fk" FOREIGN KEY ("medication_id") REFERENCES "public"."health_medications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "health_operations" ADD CONSTRAINT "health_operations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "health_profiles" ADD CONSTRAINT "health_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "health_vaccinations" ADD CONSTRAINT "health_vaccinations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "health_allergies_user_id_index" ON "health_allergies" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "health_intakes_user_id_day_index" ON "health_intakes" USING btree ("user_id","day");--> statement-breakpoint
CREATE INDEX "health_operations_user_id_index" ON "health_operations" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "health_vaccinations_user_id_index" ON "health_vaccinations" USING btree ("user_id");
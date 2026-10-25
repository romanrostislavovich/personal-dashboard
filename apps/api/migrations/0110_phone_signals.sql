CREATE TABLE "activity_phone_daily" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"device_id" uuid NOT NULL,
	"day" date NOT NULL,
	"kind" text NOT NULL,
	"key" text DEFAULT '' NOT NULL,
	"value" double precision NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "activity_phone_daily_deviceId_day_kind_key_unique" UNIQUE("device_id","day","kind","key")
);
--> statement-breakpoint
CREATE TABLE "activity_phone_signals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"device_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"at" timestamp with time zone NOT NULL,
	"data" text,
	CONSTRAINT "activity_phone_signals_deviceId_kind_at_unique" UNIQUE("device_id","kind","at")
);
--> statement-breakpoint
ALTER TABLE "activity_phone_daily" ADD CONSTRAINT "activity_phone_daily_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_phone_daily" ADD CONSTRAINT "activity_phone_daily_device_id_activity_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."activity_devices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_phone_signals" ADD CONSTRAINT "activity_phone_signals_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_phone_signals" ADD CONSTRAINT "activity_phone_signals_device_id_activity_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."activity_devices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "activity_phone_daily_user_id_day_index" ON "activity_phone_daily" USING btree ("user_id","day");--> statement-breakpoint
CREATE INDEX "activity_phone_signals_user_id_at_index" ON "activity_phone_signals" USING btree ("user_id","at");
CREATE TABLE "activity_phone_security" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"device_id" uuid NOT NULL,
	"at" timestamp with time zone NOT NULL,
	"report" jsonb NOT NULL,
	CONSTRAINT "activity_phone_security_deviceId_unique" UNIQUE("device_id")
);
--> statement-breakpoint
ALTER TABLE "activity_phone_security" ADD CONSTRAINT "activity_phone_security_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_phone_security" ADD CONSTRAINT "activity_phone_security_device_id_activity_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."activity_devices"("id") ON DELETE cascade ON UPDATE no action;
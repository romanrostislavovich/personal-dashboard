CREATE TABLE "activity_phone_notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"device_id" uuid NOT NULL,
	"app" text NOT NULL,
	"app_name" text NOT NULL,
	"title" text NOT NULL,
	"text" text NOT NULL,
	"posted_at" timestamp with time zone NOT NULL,
	CONSTRAINT "activity_phone_notifications_deviceId_app_postedAt_unique" UNIQUE("device_id","app","posted_at")
);
--> statement-breakpoint
ALTER TABLE "activity_phone_notifications" ADD CONSTRAINT "activity_phone_notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_phone_notifications" ADD CONSTRAINT "activity_phone_notifications_device_id_activity_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."activity_devices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "activity_phone_notifications_user_id_posted_at_index" ON "activity_phone_notifications" USING btree ("user_id","posted_at");
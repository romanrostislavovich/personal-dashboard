CREATE TABLE "activity_phone_collection" (
	"device_id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"collected_at" timestamp with time zone NOT NULL,
	"health_allowed" boolean NOT NULL,
	"health_newest_at" timestamp with time zone,
	"location_allowed" boolean NOT NULL,
	"revived_at" timestamp with time zone,
	"told" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
ALTER TABLE "activity_phone_collection" ADD CONSTRAINT "activity_phone_collection_device_id_activity_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."activity_devices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_phone_collection" ADD CONSTRAINT "activity_phone_collection_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
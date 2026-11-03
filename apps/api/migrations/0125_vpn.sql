CREATE SCHEMA "vpn";
--> statement-breakpoint
CREATE TABLE "vpn_days" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"device_id" uuid,
	"day" date NOT NULL,
	"rx_bytes" bigint DEFAULT 0 NOT NULL,
	"tx_bytes" bigint DEFAULT 0 NOT NULL,
	"online_minutes" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "vpn_days_deviceId_day_unique" UNIQUE("device_id","day")
);
--> statement-breakpoint
CREATE TABLE "vpn"."device_state" (
	"device_id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"first_connected_at" timestamp with time zone,
	"last_handshake_at" timestamp with time zone,
	"last_address" text,
	"seen_rx" bigint DEFAULT 0 NOT NULL,
	"seen_tx" bigint DEFAULT 0 NOT NULL,
	"pending_day" date,
	"pending_rx" bigint DEFAULT 0 NOT NULL,
	"pending_tx" bigint DEFAULT 0 NOT NULL,
	"pending_minutes" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vpn_devices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"private_key" text NOT NULL,
	"public_key" text NOT NULL,
	"preshared_key" text NOT NULL,
	"address" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone,
	CONSTRAINT "vpn_devices_userId_address_unique" UNIQUE("user_id","address"),
	CONSTRAINT "vpn_devices_publicKey_unique" UNIQUE("public_key")
);
--> statement-breakpoint
CREATE TABLE "vpn"."networks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"device_id" uuid NOT NULL,
	"network" text NOT NULL,
	"address" text NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "networks_deviceId_network_unique" UNIQUE("device_id","network")
);
--> statement-breakpoint
CREATE TABLE "vpn"."server_state" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"status_at" timestamp with time zone,
	"state" text
);
--> statement-breakpoint
CREATE TABLE "vpn_servers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"private_key" text NOT NULL,
	"public_key" text NOT NULL,
	"host" text NOT NULL,
	"port" integer NOT NULL,
	"obfuscation" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vpn_servers_userId_unique" UNIQUE("user_id")
);
--> statement-breakpoint
ALTER TABLE "vpn_days" ADD CONSTRAINT "vpn_days_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vpn_days" ADD CONSTRAINT "vpn_days_device_id_vpn_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."vpn_devices"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vpn"."device_state" ADD CONSTRAINT "device_state_device_id_vpn_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."vpn_devices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vpn"."device_state" ADD CONSTRAINT "device_state_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vpn_devices" ADD CONSTRAINT "vpn_devices_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vpn"."networks" ADD CONSTRAINT "networks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vpn"."networks" ADD CONSTRAINT "networks_device_id_vpn_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."vpn_devices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vpn"."server_state" ADD CONSTRAINT "server_state_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vpn_servers" ADD CONSTRAINT "vpn_servers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "vpn_days_user_id_day_index" ON "vpn_days" USING btree ("user_id","day");--> statement-breakpoint
CREATE INDEX "vpn_devices_user_id_index" ON "vpn_devices" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "networks_user_id_index" ON "vpn"."networks" USING btree ("user_id");
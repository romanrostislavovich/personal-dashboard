CREATE SCHEMA "sync";
--> statement-breakpoint
CREATE SEQUENCE "sync"."change_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1;--> statement-breakpoint
CREATE TABLE "sync"."conflicts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"table_name" text NOT NULL,
	"pk" jsonb NOT NULL,
	"row" jsonb NOT NULL,
	"reason" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sync"."parked" (
	"table_name" text NOT NULL,
	"pk" jsonb NOT NULL,
	"changed_at" timestamp with time zone NOT NULL,
	"row" jsonb,
	"origin" text NOT NULL,
	"error" text NOT NULL,
	"parked_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "parked_table_name_pk_pk" PRIMARY KEY("table_name","pk")
);
--> statement-breakpoint
CREATE TABLE "sync"."row_versions" (
	"table_name" text NOT NULL,
	"pk" jsonb NOT NULL,
	"changed_at" timestamp with time zone NOT NULL,
	"tx" "xid8" NOT NULL,
	"seq" bigint NOT NULL,
	"origin" text,
	CONSTRAINT "row_versions_table_name_pk_pk" PRIMARY KEY("table_name","pk")
);
--> statement-breakpoint
CREATE TABLE "sync"."state" (
	"key" text PRIMARY KEY NOT NULL,
	"value" text NOT NULL
);
--> statement-breakpoint
CREATE INDEX "row_versions_tx_seq_index" ON "sync"."row_versions" USING btree ("tx","seq");
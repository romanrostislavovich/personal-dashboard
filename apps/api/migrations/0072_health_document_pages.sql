CREATE TABLE "health_document_pages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"document_id" uuid NOT NULL,
	"page" integer NOT NULL,
	"mime_type" text NOT NULL,
	"size" integer NOT NULL,
	"data" "bytea" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "health_document_pages_documentId_page_unique" UNIQUE("document_id","page")
);
--> statement-breakpoint
ALTER TABLE "health_document_pages" ADD CONSTRAINT "health_document_pages_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "health_document_pages" ADD CONSTRAINT "health_document_pages_document_id_health_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."health_documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "health_document_pages_user_id_index" ON "health_document_pages" USING btree ("user_id");
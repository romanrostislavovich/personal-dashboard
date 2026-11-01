-- The parent key is deferrable: the trash restores a group in one transaction, steps maybe first.
ALTER TABLE "tasks" ADD COLUMN "parent_id" uuid;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_parent_id_tasks_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action DEFERRABLE INITIALLY IMMEDIATE;--> statement-breakpoint
CREATE INDEX "tasks_parent_id_index" ON "tasks" USING btree ("parent_id");
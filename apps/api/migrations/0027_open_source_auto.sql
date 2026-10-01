ALTER TABLE "github_tracked_repos" DROP CONSTRAINT "github_tracked_repos_userId_fullName_unique";--> statement-breakpoint
ALTER TABLE "github_tracked_repos" ADD COLUMN "provider" text DEFAULT 'github' NOT NULL;--> statement-breakpoint
ALTER TABLE "github_tracked_repos" ADD COLUMN "relation" text DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE "github_tracked_repos" ADD COLUMN "external_id" text;--> statement-breakpoint
ALTER TABLE "github_tracked_repos" ADD COLUMN "hidden" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "github_tracked_repos" ADD COLUMN "notify" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "github_tracked_repos" ADD COLUMN "npm_package_manual" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "github_tracked_repos" ADD COLUMN "language" text;--> statement-breakpoint
ALTER TABLE "github_tracked_repos" ADD COLUMN "is_fork" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "github_tracked_repos" ADD COLUMN "is_archived" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "github_tracked_repos" ADD CONSTRAINT "github_tracked_repos_userId_provider_fullName_unique" UNIQUE("user_id","provider","full_name");--> statement-breakpoint
-- The repositories already here were picked by hand: they keep their notifications and the
-- npm package typed for them. Everything the account brings from now on starts silent.
UPDATE "github_tracked_repos" SET "notify" = true, "npm_package_manual" = ("npm_package" IS NOT NULL);

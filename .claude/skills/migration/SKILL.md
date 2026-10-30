---
name: migration
description: Create a database migration for the dashboard safely — drizzle-kit generate, rename, journal, schema-only check, boot on a scratch DB, sync client. Use whenever a *.schema.ts changes.
---

# A migration

1. Change the `*.schema.ts` (a primary key and `userId` on every table).
2. `npm run db:generate` — it writes `apps/api/migrations/NNNN_<random>.sql` and a snapshot.
3. Rename it with a plain `mv` to `NNNN_<meaning>.sql` and fix `"tag"` in
   `apps/api/migrations/meta/_journal.json`; check the journal entry and the file name match
   (a silent failed rename once left the journal pointing at a missing file).
4. Read the SQL: **schema only**. No `UPDATE`/`INSERT`/backfill — the owner's local instance is a
   sync client that runs the same migrations and would send old rows back. A backfill goes into a
   server-only job or a one-off server action.
5. Not yet pushed and needs another change? Delete the `.sql`, the snapshot and the journal entry
   (`git checkout` the journal), then generate again — never edit a migration already deployed.
6. Run the module's `*.db.spec.ts` on a scratch DB (`pd_test`); boot the image on a scratch DB if
   a new table is read at start-up (the `verify-ui` skill).
7. After the deploy the owner runs `! docker compose up -d --build app` so the local instance has it.

`apps/api/migrations/meta` is excluded from prettier — leave its formatting to drizzle-kit.

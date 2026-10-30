---
name: architecture-review
description: Review the current change against this dashboard's own architecture rules and known pitfalls (module boundaries, client core, userId, sync client, migrations, onModuleInit, i18n, achievements, README). Use before merging a feature, or when the owner asks for an architecture check.
---

# Architecture review

Review `git diff main...HEAD` (or the working tree) against the rules below. Report each finding as
file:line, the rule, and a concrete fix; say plainly when a rule holds. Answer in Russian.

Run it in a subagent (`Agent`, type `general-purpose`) when the diff is large, giving it this
checklist and the diff range; otherwise inline.

## Boundaries

- A module (`libs/modules/*`) imports only `@pd/api-core`, `@pd/web-core`, `@pd/client-core`,
  `@pd/contracts` — never another module (also enforced by `@nx/enforce-module-boundaries`).
- Every request URL/body is in `libs/client/core`; web `*.api.ts` only wraps it.
- Types and zod schemas only in `libs/shared/contracts`; the backend validates with `ZodValidationPipe`.
- Something owned by another section is reached through a core registry, not an import.

## Data and sync (the costly ones)

- Every table has a primary key and `userId`; every query filters by `userId` (look for a select or
  update without it).
- Migrations: schema only — no `UPDATE`/`INSERT` of data (a sync client runs them too).
- A new table read in `onModuleInit` crashes a server whose migration has not run — needs a boot
  on a scratch DB.
- Jobs and writes-on-read: the local instance is a sync client and runs no jobs; nothing may be
  written on a GET (a client would clash on unique keys).
- Sync: child rows reference parents by FK — a change that deletes/merges parents (devices, accounts)
  must keep the children's parents existing on both sides, or the client parks the children
  (2026-10: 11.6k parked rows → "out of shared memory").
- Big transactions with a savepoint per row hold every lock to the end — batch them.

## Interface and texts

- i18n en/ru keys match; server texts in `*.messages.ts` with both languages.
- Angular templates: `===`/`!==` only, `@if (x(); as v)` instead of `!` assertions.
- Mobile width works (tabs, grids, dialogs).
- Notifications with buttons: at most 3 if they should be answered in the phone's shade.

## Upkeep

- Achievements updated for what the change counts; none left unreachable.
- README.md, docs/telemetry.md, docs/roadmap.md, the module's proposal updated.
- Tests: logic in `*.spec.ts`, services in `*.db.spec.ts` on a scratch DB.

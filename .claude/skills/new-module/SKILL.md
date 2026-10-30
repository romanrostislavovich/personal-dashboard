---
name: new-module
description: Checklist for adding a new module (section) to the dashboard or a large feature inside one — contracts, client core, backend, web, i18n, achievements, Links, telemetry, AI tools, README. Use before writing any code of a new module or big feature.
---

# A new module

Read `docs/architecture.md` ("how to add a module") first. Answer the owner in Russian.

## 0. Questions first

The owner wants many clarifying questions **before** any code (AskUserQuestion, 2–4 options each,
the recommended one first): what it shows, where the data comes from, what is stored, what is
notified, what goes to Links, mobile layout. Write the decisions into the matching
`docs/proposals/*.md` before building.

## 1. Where things go (never break these)

- `libs/shared/contracts` — types and zod schemas of every request/response. Nothing else.
- `libs/client/core` (`@pd/client-core`) — every request (URL, params, body). A web module's
  `*.api.ts` only wraps it (`httpResource` for reads).
- `libs/modules/<name>/api` — NestJS: depends only on `@pd/api-core` and `@pd/contracts`, **never**
  on another module. Something another module owns (a device token, …) goes through a core registry
  (pattern: `DeviceAuthService`, `LinksService.register*`).
- `libs/modules/<name>/web` — standalone components, `OnPush`, signals, Material 3 `matButton`.
- Register the module in `apps/api` and `apps/web/src/app/modules.ts`; restart `npm run dev`.

## 2. Data

- Every table: a primary key (`id uuid`) and `userId`; every query filters by `userId`.
- `npm run db:generate`, rename the migration with a plain `mv` and fix the journal tag; check the
  SQL — **no data updates in migrations** (a sync client runs them and sends old rows back).
- Jobs run on the server only (a sync client runs none). Nothing written on a GET.

## 3. Everything that follows a feature (the owner checks these)

- [ ] i18n: `i18n/en.json` and `ru.json` of the module — the same keys (compare them by script).
- [ ] Server texts: `*.messages.ts` with `en` and `ru` (`pickMessages`).
- [ ] **Achievements** `*.achievements.ts`: new ones for what it counts; none left unreachable.
- [ ] Links: daily metrics (`registerDailyMetrics`), labels `*.links.*` in i18n.
- [ ] Telemetry: `docs/telemetry.md` — every new signal and its Links keys.
- [ ] AI: `*.ai-tools.ts` read tools (writes ask for confirmation); search `*.search.ts`; recall.
- [ ] Notifications: through `NotificationsService` (buttons → `registerAction`, ≤3 for the shade).
- [ ] Home widget if it has a "today" number; command palette commands.
- [ ] Demo data (`*.demo.ts`) for the demo instance.
- [ ] Tests: pure logic in `*.spec.ts`; the service on a scratch DB in `*.db.spec.ts`.
- [ ] Mobile width (≈390px): tabs, grids, dialogs — open it in the `verify-ui` skill.
- [ ] **README.md**: the section in the table, integrations, features.
- [ ] `docs/roadmap.md`: mark it built (✅), with what was not verified live.

Then the `architecture-review` skill, then `deploy`.

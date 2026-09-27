# Architecture

## Core + modules

```
                ┌───────────────────── core ─────────────────────┐
  apps/api ───► │ libs/api/core: DB · auth · projects · scheduler │
                │   notifications · secrets · achievements · AI   │
  apps/web ───► │ libs/web/core: layout · auth · i18n ·           │ ◄── libs/shared/contracts
                │   home page with widgets · module SDK           │     (types + zod schemas)
                └────────────▲────────────────────▲───────────────┘
                             │                    │
                 libs/modules/birthdays    libs/modules/finance    … (diary, music, games, …)
                      api/ + web/               api/ + web/
```

Every feature is a **module** made of two libraries (`api` and `web`). A module depends only on the
core and the contracts and **never on another module**. ESLint enforces this
(`@nx/enforce-module-boundaries`, tags `type:module` / `type:core` / `type:contracts`), so any module
can be removed or disabled without breaking anything.

Apps (`apps/*`) are thin hosts with no business logic — only the list of enabled modules:

- `apps/api/src/modules.ts`
- `apps/web/src/app/modules.ts`

## Key decisions

| Decision                             | Why                                                                                                                         |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| **Nx monorepo**                      | Angular and Nest in one repository, shared types, module boundaries checked by the linter                                   |
| **zod contracts** (`@pd/contracts`)  | one schema gives both the TS type for the frontend and validation on the backend (`ZodValidationPipe`)                      |
| **Drizzle ORM**                      | tables are defined in TS next to the module (`*.schema.ts`), not in one big file; SQL migrations are human-readable         |
| **pg-boss** for background jobs      | the queue and cron live in the same PostgreSQL — no Redis; missed runs are caught up                                        |
| **Notifications through channels**   | a module calls `notifications.send()` and does not know where the message goes; Telegram is the first `NotificationChannel` |
| **Everything is scoped by `userId`** | multiple users are supported without any schema changes                                                                     |
| **One Docker image**                 | the API serves the built frontend — self-hosting with one command                                                           |
| **Electron as a thin shell**         | the desktop app loads the same web app from the server (or localhost) and adds tray, autostart and background running       |
| **i18n via Transloco**               | each module keeps its translations (`i18n/en.json`, `i18n/ru.json`); the core merges them into one dictionary               |

## Anatomy of a module

Using `birthdays` as an example:

```
libs/modules/birthdays/
  api/src/lib/
    birthdays.schema.ts          Drizzle table
    birthdays.service.ts         business logic
    birthdays.controller.ts      REST: /api/birthdays
    birthday-reminders.job.ts    background job (registered in the scheduler)
    birthdays.messages.ts        notification texts per language
    birthdays.achievements.ts    achievements of the module
    birthdays.ai-tools.ts        data the AI assistant can request
    next-birthday.ts (+ .spec)   pure logic — easy to test
    birthdays.module.ts          Nest module
  web/src/lib/
    birthdays.api.ts             HTTP client
    birthdays.page.ts            module page
    upcoming-birthdays.widget.ts home page widget
    i18n/en.json, i18n/ru.json   translations
    birthdays.module.ts          module description for the web core (WebDashboardModule)
```

Request and response types live in `libs/shared/contracts/src/lib/birthdays.ts`.

## Writing a new module

Say it is `strava`.

1. **Generate the libraries:**
   ```bash
   npx nx g @nx/nest:library libs/modules/strava/api --name=strava-api --importPath=@pd/strava-api --tags=scope:api,type:module
   npx nx g @nx/angular:library libs/modules/strava/web --name=strava-web --importPath=@pd/strava-web --prefix=pd --tags=scope:web,type:module --skipModule
   ```
2. **Contracts:** add `libs/shared/contracts/src/lib/strava.ts` (zod schemas and interfaces) and export it from `index.ts`.
3. **Backend:**
   - tables in `strava.schema.ts` (reference core tables via `@pd/api-core/schema`);
   - a service and a controller; `@CurrentUser()` gives the current user, `ZodValidationPipe` validates input;
   - background jobs: `SchedulerService.register({ name: 'strava.sync', cron, handler })` in `onModuleInit`;
   - notifications: `NotificationsService.send(userId, { title, body, source: 'strava' })`, texts in
     `strava.messages.ts` via `pickMessages({ en: {...}, ru: {...} }, user.locale)`;
   - Telegram commands: `TelegramBotService.registerCommand({ command, description, handler })`
     (example — `/d` in `libs/modules/diary/api/src/lib/diary.jobs.ts`);
   - achievements: `strava.achievements.ts` — a metric (`measure(userId) → number`) and tiers via
     `achievementTier(goal, icon, title, description)`, registered with `AchievementsService.register()`
     (example — `libs/modules/diary/api/src/lib/diary.achievements.ts`). The achievements page picks
     them up automatically and groups them by `module`;
   - AI access: `strava.ai-tools.ts` — `AiService.registerTool({ name, module, description,
parameters (JSON Schema), handler })`. Write the description for the model: what it returns and
     when it is useful (example — `libs/modules/finance/api/src/lib/finance.ai-tools.ts`).
4. **Migration:** `npm run db:generate` → review the SQL in `apps/api/migrations`.
5. **Frontend:** export a `WebDashboardModule` with `id`, menu item, routes, translations
   (`en` and `ru`) and widgets.
6. **Enable** the module in `apps/api/src/modules.ts` and `apps/web/src/app/modules.ts`.
7. **Restart `npm run dev`**: the bundlers read the `@pd/*` aliases from `tsconfig.base.json` only on start.

Tokens of external services are entered by the user in the module UI and stored with the core
`SecretsService`: `secrets.set(userId, 'strava.token', value)`. Values are encrypted with AES-256-GCM
using `ENCRYPTION_KEY` and are never sent to the frontend. Example — `GithubTokenService` in `github-oss`.

## Adding a cost provider

Automatic cost import is part of the `finance` module (`libs/modules/finance/api/src/lib/cost-sources`).
To add a service (e.g. DigitalOcean):

1. Add its id to `COST_PROVIDERS` in `libs/shared/contracts/src/lib/finance.ts`.
2. Implement `CostProviderAdapter` in `cost-sources/providers/<name>.provider.ts`:
   `verify(token)` checks the token, `measure(token, state)` returns either the full amount for the
   month (`monthTotal`) or the spending since the last sync (`increment`). Keep calculations in pure,
   tested functions next to it (example — `hetzner-cost.ts`).
3. Register the class in `FinanceModule` and `CostSourcesService`.
4. Add a name and token hint to `finance/web/src/lib/i18n/*.json` → `costSources.providers`.
5. `npm run db:generate` — the `finance_cost_provider` enum gets the new value.

## Adding a language

1. Add the code to `SUPPORTED_LOCALES` in `libs/shared/contracts/src/lib/auth.ts`.
2. Add `i18n/<code>.json` to the web core and every module, and register it in `translations`.
3. Add the language to every `*.messages.ts`, to `core.messages.ts` and to achievement tiers.
4. Register Angular locale data in `libs/web/core/src/lib/provide-dashboard.ts`.

## Core services

- **Secrets:** `SecretsService` — an encrypted per-user key-value store.
- **Achievements:** `AchievementsService` — modules register metrics with tiers; the engine evaluates
  them hourly and on page load, and sends one notification with all new achievements.
- **AI:** `AiService` — any OpenAI-compatible API; `ask()` is a dialogue with module tools
  (function-calling loop in `tool-loop.ts`), `complete()` is a single request without tools.
- **Auth:** a global `AuthGuard` (JWT); public endpoints are marked with `@Public()`.
- **Configuration:** all environment variables are described by a zod schema in
  `libs/api/core/src/lib/config/env.ts`; on errors the app does not start and explains what is wrong.
- **Dates:** calendar dates (birthday, transaction date) are stored as `YYYY-MM-DD` without a time zone;
  “today” is computed in `APP_TIMEZONE` (`todayIn()` in contracts).
- **Money:** `numeric(14,2)`; amounts in different currencies are not converted and are summed separately.

> Code comments are currently written in Russian. English comments in new code are welcome.

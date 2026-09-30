# Architecture

## Core + modules

```
                ┌───────────────────── core ─────────────────────┐
  apps/api ───► │ libs/api/core: DB · auth · projects · scheduler │
                │   notifications · secrets · achievements · AI   │
  apps/web ───► │ libs/web/core: layout · auth · i18n ·           │ ◄── libs/shared/contracts
                │   home page with widgets · module SDK           │     (types + zod schemas)
                │     └─► libs/client/core: session · API client ·│
                │         live events · locale (plain TypeScript) │
                └────────────▲────────────────────▲───────────────┘
                             │                    │
                 libs/modules/birthdays    libs/modules/finance    … (diary, music, games, …)
                      api/ + web/               api/ + web/
```

Every feature is a **module** made of two libraries (`api` and `web`). A module depends only on the
core and the contracts and **never on another module**. ESLint enforces this
(`@nx/enforce-module-boundaries`, tags `type:module` / `type:core` / `type:contracts`), so any module
can be removed or disabled without breaking anything.

**The client core** (`@pd/client-core`, tag `scope:client`) is what every client of the dashboard
shares: the session and its token, the API client (server address, token, JSON, files, errors, a
401 ends the session), live events over Server-Sent Events with reconnects, the UI language — and
**every request of the API**, the core's and each module's (`libs/client/core/src/lib/modules/`),
like their types live in `@pd/contracts`. It is plain TypeScript without Angular, so a mobile app —
whatever it is built with — gets the same behaviour; a platform plugs in the server address,
`fetch` and a key-value store (`ClientPlatform`).

Requests come in two kinds: reads are `{ url, params }` objects (`DIARY_READS.entries(query)`),
writes are functions (`diaryApi(api).save(day, input)`). The web core wraps the client for Angular
(`DASHBOARD_CLIENT`, `AuthService`, `RealtimeClient`); a module's `*.api.ts` passes the reads to
`httpResource` (which takes exactly such objects) and the writes through `fromCore()` as
Observables. Errors from both are read with `errorStatus()` / `errorBody()`.

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
    birthdays.digest.ts          its section of the morning digest
    *.server-actions.ts          actions that call outside services (see below; birthdays has none)
    next-birthday.ts (+ .spec)   pure logic — easy to test
    birthdays.module.ts          Nest module
  web/src/lib/
    birthdays.api.ts             the module's requests of the client core, for Angular
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
   **Requests:** add `libs/client/core/src/lib/modules/strava.ts` — `STRAVA_READS` (`{ url, params }`
   via `apiRequest`) and `stravaApi(api)` with the reads and writes — and export it from `index.ts`.
   Every client (web, mobile) uses these; none writes its own URLs.
3. **Backend:**
   - tables in `strava.schema.ts` (reference core tables via `@pd/api-core/schema`);
   - a service and a controller; `@CurrentUser()` gives the current user, `ZodValidationPipe` validates input;
   - background jobs: `SchedulerService.register({ name: 'strava.sync', cron, handler })` in `onModuleInit`;
   - notifications: `NotificationsService.send(userId, { title, body, source: 'strava' })`, texts in
     `strava.messages.ts` via `pickMessages({ en: {...}, ru: {...} }, user.locale)`;
   - Telegram commands: `TelegramBotService.registerCommand({ command, description, handler })`
     (example — `/d` in `libs/modules/diary/api/src/lib/diary.jobs.ts`);
   - achievements: `strava.achievements.ts` — a metric (`measure(userId) → number`) and tiers via
     `achievementTiers([goal, icon, title, description], ...)`, registered with
     `AchievementsService.register()` (example — `libs/modules/games/api/src/lib/dota/dota.achievements.ts`).
     Rarity (common → legendary) follows the tier position unless set explicitly; it gives XP, and
     XP gives the player level shown on the home page. The achievements page picks them up
     automatically and groups them by `module`;
   - AI access: `strava.ai-tools.ts` — `AiService.registerTool({ name, module, description,
parameters (JSON Schema), handler })`. Write the description for the model: what it returns and
     when it is useful (example — `libs/modules/finance/api/src/lib/finance.ai-tools.ts`).
     A tool that changes data sets `writes: true` and validates its arguments with the contracts
     schema; such tools are offered only to the assistant (Telegram and the AI chat). A tool that
     deletes or overwrites data also sets `confirm` (returns what will be affected): the first call
     changes nothing and the model asks the user; the call runs when repeated after the user's reply.
     Edits take the record id and only the fields to change (`changedFields`, `findById`).
     Never expose secrets (API keys, tokens) through tools — they are set up in the dashboard.
   - morning digest: `strava.digest.ts` — a section with `id`, `module`, `description` and
     `collect`, registered with `MorningDigestService.register()`. The digest tells only what
     changed since the previous one, so `collect(userId)` returns facts that stay the same until
     there is news (stars, a status, a release tag — not response times or "days until"); `null` —
     nothing to tell. `always: true` puts the section in every digest (the weather). Example —
     `libs/modules/github-oss/api/src/lib/github-oss.digest.ts`.
   - calls to outside services on a user's request (connect an account, "refresh now"):
     `strava.server-actions.ts` — `ServerActions.register('strava.sync', handler)`, and the
     controller / AI tool calls `ServerActions.run(userId, 'strava.sync', args)`. They then run on
     the server even when the user clicks in the local copy (example —
     `libs/modules/music/api/src/lib/music.server-actions.ts`). Background jobs need nothing: they
     run on the server anyway.
4. **Migration:** `npm run db:generate` → review the SQL in `apps/api/migrations`.
5. **Frontend:** `strava.api.ts` wraps the requests of the client core for Angular (reads as
   `httpResource(() => STRAVA_READS.x())`, writes as `fromCore(() => this.strava.y())`, example —
   `libs/modules/birthdays/web/src/lib/birthdays.api.ts`); export a `WebDashboardModule` with `id`,
   menu item, routes, translations (`en` and `ru`) and widgets.
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

## Security

- **Sessions:** an access token lives 15 minutes, in memory only; a refresh token (only its
  SHA-256 is stored, in the unsynced `auth` schema) gives new ones — in an httpOnly,
  SameSite=Strict cookie for the web, in the response for an app with a secure store
  (`client: 'app'`). It is replaced once a day; the replaced one works for another minute so two
  tabs do not sign each other out. Signing out, a new password (other devices) and the devices list
  in the settings end sessions; the guard notices within a minute.
- **Two-factor sign-in:** TOTP (RFC 6238, `auth/totp.ts`), the secret and hashed recovery codes in
  `SecretsService`. After the password the server returns a 5-minute challenge for the code.
- **Throttling:** 10 wrong passwords or codes per address or account in 15 minutes lock it for
  the rest of the window (`LoginThrottle`). The API trusts `X-Forwarded-For` from the proxy.
- **AI:** the user switches modules off for the AI (`disabledModules`): no tools, no digest
  sections, `complete(…, module)` refuses. Every change the assistant makes is logged
  (`AiActionsService`); what it deletes lands in the trash like anything else.

## Core services

- **Secrets:** `SecretsService` — an encrypted per-user key-value store.
- **Achievements:** `AchievementsService` — modules register metrics with tiers; the engine evaluates
  them hourly, after the user's changes and on page load, and sends one notification with all new
  achievements. With sync on, only the server unlocks achievements; a client shows progress.
  The core adds its own: achievements about achievements and about the dashboard itself
  (how long and how often it is used — visit days go to `dashboard_active_days`).
- **Server actions:** `ServerActions` — calls to outside services made on a user's request; on a
  sync client they are forwarded to the server (see [sync.md](sync.md)).
- **Sync:** `SyncService` / `SyncClient` — two-way sync between a local instance and a server
  (`SYNC_MODE`, see [sync.md](sync.md)). Every table in `public` is tracked by a trigger — module
  tables need nothing extra, but every table must have a primary key. Sync works on the whole
  database, not per user. A client runs no scheduled jobs, unlocks no achievements, does not
  receive bot messages and forwards server actions. Every 6 hours the client compares row counts
  and hashes of every table with the server's (`SyncStore.fingerprints`); what sync set aside
  (`sync.conflicts`, `sync.parked`) is shown in the settings, where either version can be kept
  (`SyncConflictsService`).
- **Backups:** `BackupService` — the server watches the daily dumps and the weekly test restore of
  `deploy/backup.sh` (`BACKUP_DIR`) and reports problems to the owner (the first user); the sync
  client copies the newest dump to the computer (`BACKUP_COPY_DIR`).
- **AI:** `AiService` — any OpenAI-compatible API; `ask()` is a dialogue with module tools
  (function-calling loop in `tool-loop.ts`), `complete()` is a single request without tools.
- **Auth:** a global `AuthGuard`; public endpoints are marked with `@Public()`. See Security below.
- **Trash:** `TrashService` — a trigger on every table of `public` keeps deleted rows in the
  `trash` schema for 30 days (not synced: each instance keeps what was deleted on it); one
  transaction is one item, restored with everything deleted along with it. A table whose deletions
  are housekeeping (old check results, logs) goes to `NOT_TRASHED` in `trash-triggers.ts`.
- **Configuration:** all environment variables are described by a zod schema in
  `libs/api/core/src/lib/config/env.ts`; on errors the app does not start and explains what is wrong.
- **Dates:** calendar dates (birthday, transaction date) are stored as `YYYY-MM-DD` without a time zone;
  “today” is computed in `APP_TIMEZONE` (`todayIn()` in contracts).
- **Money:** `numeric(14,2)`; totals are converted into the user's main currency at the ECB rate of
  each transaction's day (Frankfurter; today's rate from open.er-api for a currency the ECB lacks),
  kept as they are otherwise (`finance/currency`).
- **Language:** code, comments and docs are in English; user-facing texts go through i18n (`en` + `ru`).

# Personal Dashboard

A self-hosted dashboard for your daily life: birthdays, personal and project finances, website
monitoring, open source stats, a diary, music, games, personal achievements — and an AI assistant
that can answer questions about all of it. Notifications arrive in Telegram.

It runs as a website, as a desktop app (Windows / macOS / Linux, with tray and autostart) and as a
single Docker image on your server. Every feature is a module: enable, disable or write your own.

![Dashboard](docs/images/dashboard.png)

**Stack:** Nx · Angular 22 + Angular Material · NestJS 11 · PostgreSQL + Drizzle ORM · pg-boss · grammY · Electron

## Features

| Module          | What it does                                                                                                                                                                                        |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ✨ AI           | Chat about your own data (DeepSeek, OpenAI, Ollama or any OpenAI-compatible API), `/ask` in Telegram, a morning digest, weekly diary summaries                                                      |
| 📔 Diary        | One markdown entry per day with autosave, mood, #tags, emoji marks on phrases (`==🔥 text==`), photos, search, year heatmap, “on this day”, mood insights; Telegram `/d`, `/mood`, `/today`, photos |
| 💰 Finance      | Income and expenses per wallet (personal or a project), multi-currency, top categories, recurring payments, automatic cost import from Hetzner Cloud and DeepSeek                                   |
| 🎂 Birthdays    | Countdown and age, reminders N days ahead                                                                                                                                                           |
| 🐙 Open Source  | GitHub repositories: star history and growth, forks, issues, PRs, releases, npm downloads; alerts on new issues/PRs, releases and star milestones                                                   |
| 📡 Monitoring   | Uptime checks every 5 minutes, uptime for 24 h / 7 / 30 days, response time chart, SSL expiry; “down / back up” alerts and SSL reminders                                                            |
| 🎧 Music        | Last.fm listening history, plays per day, top artists / tracks / albums; Spotify “now playing”                                                                                                      |
| 🎮 Games        | Dota 2 via OpenDota (medal, win rate, matches, heroes) and World of Warcraft via Battle.net (character, item level, achievements)                                                                   |
| 🏆 Achievements | 42 personal achievements across all modules, with tiers and progress                                                                                                                                |
| 🚀 Projects     | Your websites and services — finance, monitoring and AI refer to them                                                                                                                               |

The UI, notifications and AI answers are available in **English** and **Russian**.

## Quick start (development)

Requirements: Node.js 24+ and Docker.

```bash
npm install
cp .env.example .env          # set JWT_SECRET, ENCRYPTION_KEY, ADMIN_EMAIL, ADMIN_PASSWORD
npm run db:up                 # PostgreSQL in Docker
npm run dev                   # API on :3300 + web on http://localhost:4200
```

Sign in with `ADMIN_EMAIL` / `ADMIN_PASSWORD` — the user is created on the first start. Database
migrations are applied automatically when the API starts.

> If port 5432 is taken by another PostgreSQL, set `DB_PORT=5433` in `.env` and update the port in `DATABASE_URL`.

## Self-hosting

The whole app is one Docker image: the API also serves the built frontend.

```bash
cp .env.example .env          # fill in the values
docker compose up -d --build  # database + app on :3300
```

Put a reverse proxy with HTTPS in front of it (Caddy, Traefik, nginx) and set `PUBLIC_URL` to the
public address. Background jobs (reminders, uptime checks, syncs) run in the same container; if the
server was down when a job was due, it runs once after start.

Prebuilt images are published to GitHub Container Registry on every release:
`ghcr.io/romanrostislavovich/personal-dashboard`.

## Desktop app

Installers for Windows, macOS and Linux are attached to [GitHub Releases](../../releases). On the
first start the app asks for the server URL — your server or a local Docker (`http://localhost:3300`).
The tray menu has “Start with the system” and “Change server”.

```bash
npm run dev:desktop           # Electron on top of the dev server
npm run desktop:package       # build an installer → dist/desktop-installers
```

## Integrations

All tokens entered in the UI are stored encrypted (AES-256-GCM with `ENCRYPTION_KEY`) and are never
sent back to the browser.

| Integration       | How to connect                                                                                                                      |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Telegram          | Create a bot with [@BotFather](https://t.me/BotFather), set `TELEGRAM_BOT_TOKEN`, then Settings → “Connect Telegram”                |
| AI                | AI → pick a provider (DeepSeek by default), paste the API key. For full privacy use a local model via Ollama                        |
| GitHub            | Optional fine-grained token (read-only) in Open Source — without it GitHub allows 60 requests per hour                              |
| Hetzner Cloud     | Finance → Auto-import → a project API token with Read access                                                                        |
| DeepSeek costs    | Finance → Auto-import → an API key; spending is derived from balance changes                                                        |
| Last.fm           | Music → username + API key from [last.fm/api/account/create](https://www.last.fm/api/account/create)                                |
| Spotify           | Create an app at developer.spotify.com, Redirect URI = `PUBLIC_URL` + `/api/music/spotify/callback`, set `SPOTIFY_CLIENT_ID/SECRET` |
| Dota 2            | Games → Steam ID or profile link; enable “Expose Public Match Data” in Dota                                                         |
| World of Warcraft | Games → Battle.net client ID and secret from develop.battle.net, then region / realm / character                                    |

Telegram bot commands: `/d text` — add to today’s diary entry, `/mood 1–5` — rate the day, `/today` — show today’s entry, `/ask question` — ask the AI. A photo sent to the bot goes into today’s entry.

## Configuration

See [`.env.example`](.env.example). The most important variables:

| Variable             | Description                                           |
| -------------------- | ----------------------------------------------------- |
| `DATABASE_URL`       | PostgreSQL connection string                          |
| `JWT_SECRET`         | Secret for sign-in tokens, at least 32 characters     |
| `ENCRYPTION_KEY`     | Key for integration tokens in the DB — do not lose it |
| `APP_TIMEZONE`       | Time zone of daily jobs, e.g. `Europe/Berlin`         |
| `ALLOW_REGISTRATION` | `true` to let other people sign up (off by default)   |
| `DEFAULT_LOCALE`     | Language of the first user: `en` or `ru`              |
| `PUBLIC_URL`         | Public address of the dashboard (OAuth callbacks)     |

## Commands

| Command                     | What it does                                         |
| --------------------------- | ---------------------------------------------------- |
| `npm run dev`               | API + web in development mode                        |
| `npm run dev:desktop`       | Desktop shell on top of the dev server               |
| `npm run db:up`             | Start PostgreSQL in Docker                           |
| `npm run db:generate`       | Create an SQL migration after changing `*.schema.ts` |
| `npm test` / `npm run lint` | Tests / linter for all projects                      |
| `npm run build`             | Production build of API and web                      |
| `npm run desktop:package`   | Build a desktop installer                            |

## Architecture

```
apps/
  api/        NestJS host: only wires the core and the enabled modules (src/modules.ts)
  web/        Angular host: only wires the core and the enabled modules (src/app/modules.ts)
  desktop/    Electron shell: tray, autostart, server selection
libs/
  shared/contracts/   shared types and zod schemas for API and web
  api/core/           backend core: DB, auth, projects, scheduler, notifications, secrets,
                      achievements engine, AI gateway
  web/core/           frontend core: layout, auth, i18n, home page with widgets, module SDK
  modules/<name>/api  backend of a module
  modules/<name>/web  frontend of a module
```

Modules depend only on the core and contracts — never on each other (enforced by ESLint). A module
can add its own pages, widgets, background jobs, notifications, Telegram commands, achievements and
AI tools. See [docs/architecture.md](docs/architecture.md) for details and a step-by-step guide to
writing a module, and [docs/roadmap.md](docs/roadmap.md) for what is next.

## Contributing

Contributions are welcome — see [CONTRIBUTING.md](CONTRIBUTING.md). Please report security issues
privately as described in [SECURITY.md](SECURITY.md).

## License

[MIT](LICENSE)

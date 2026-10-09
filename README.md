# Personal Dashboard

[![CI](https://github.com/romanrostislavovich/personal-dashboard/actions/workflows/ci.yml/badge.svg)](https://github.com/romanrostislavovich/personal-dashboard/actions/workflows/ci.yml)
[![Security](https://github.com/romanrostislavovich/personal-dashboard/actions/workflows/security.yml/badge.svg)](https://github.com/romanrostislavovich/personal-dashboard/actions/workflows/security.yml)
[![Release](https://img.shields.io/github/v/release/romanrostislavovich/personal-dashboard)](https://github.com/romanrostislavovich/personal-dashboard/releases)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

**Your whole life in one self-hosted dashboard — with an AI that knows all of it.**

Finance, a diary, tasks, music, games, coding stats, time at the computer, uptime of your sites —
in one place on your own server, with notifications and an assistant in Telegram. Web, desktop
(Windows / macOS / Linux) and an installable PWA. English and Russian.

![Dashboard](docs/images/dashboard.png)

> **Status:** a personal project, used every day by its author. It works and is tested, but
> before 1.0 an update may need attention — read the [changelog](CHANGELOG.md) first.

## Highlights

- 🤖 **An AI that can act, not only answer** — ask "how much did I spend on food this month?",
  or tell it in Telegram "remind me tomorrow at 9 to call mum" and it is done. Works with
  DeepSeek, OpenAI, Ollama (fully local) or any OpenAI-compatible API
- 💬 **Telegram as a remote** — voice messages, a photo of a receipt becomes an expense, a bank
  statement PDF becomes transactions, reminders with "Done / +1 hour / Tomorrow" buttons
- 📖 **Life** — one feed of any day across every section, a "Wrapped" of the month or the year
  written by the AI, goals of a year counted from your data, questions to your own history
- 🔗 **Sections that know each other** — a project with its hours, commits, money and uptime on
  one page; what goes with your good and bad days; the last commit before a site went down;
  subscriptions you pay for and do not use
- ⚡ **Automations** — "if X, then Y" across sections: a site is down → a task, no diary entry by
  22:00 → a reminder; describe the rule in a sentence and the AI builds it
- ⏱️ **Desktop tracker** (Windows) — which programs and windows ate your day, focus sessions, break
  reminders, daily limits on games, disk cleanup advice from the AI
- 🛡️ **Security agent** — watches sign-ins, the server (SSH, firewall, open ports), your computers
  and repositories every hour; an AI investigates every morning and tells what to fix
- 🏆 **360+ achievements** across all sections, with XP and a player level
- 🎨 **Comfortable** — Ctrl+K opens any page and searches all your data, themes and accents, a
  home page you arrange yourself, an installable app that opens offline
- 🔒 **Yours** — your server, tokens encrypted, two-factor sign-in, a 30-day trash, an offline
  local copy that syncs both ways with the server

## Sections

|                    |                                                                                     |
| ------------------ | ----------------------------------------------------------------------------------- |
| 💰 **Finance**     | wallets, main currency, budgets, subscriptions, savings goals, wishlist price watch |
| 📔 **Diary**       | Markdown per day, mood, tags, photos, year heatmap, "on this day"                   |
| ✅ **Tasks**       | TODO list with repeating tasks, reminders at your local time                        |
| 👨‍💻 **Development** | repositories, stars, releases, npm downloads, contribution streaks, coding time     |
| 🎧 **Music**       | listening history and tops, now playing, your own tracks' stats                     |
| 🎮 **Games**       | Steam library, Dota 2 matches, WoW characters (gear, Mythic+, raids, PvP)           |
| ⏱️ **Activity**    | time at the computer per program, project and day, Pomodoro                         |
| 📡 **Monitoring**  | uptime every 5 minutes, response time, SSL expiry, down / up alerts                 |
| 🌤️ **Weather**     | today and the week ahead, what to wear — tuned to how you take the cold             |
| 🎂 **Birthdays**   | countdowns and reminders                                                            |
| 🚀 **Projects**    | your sites and services — finance, monitoring and AI refer to them                  |

Every section is a module: hide what you do not use, or [write your own](docs/architecture.md).

## Integrations

- **AI:** DeepSeek · OpenAI · Ollama · any OpenAI-compatible API
- **Messaging:** Telegram (bot, notifications, voice)
- **Code:** GitHub · GitLab · Bitbucket · npm · WakaTime
- **Music:** Last.fm · Spotify · SoundCloud
- **Games:** Steam · Dota 2 (OpenDota) · World of Warcraft (Battle.net, incl. Classic)
- **Money:** ECB exchange rates · Hetzner Cloud and DeepSeek costs · bank statements (PDF / Excel / CSV)
- **Other:** Open-Meteo weather (no key)

Everything is connected in Settings → Integrations, each with a step-by-step guide —
see [docs/integrations.md](docs/integrations.md).

## Run it

One Docker image (amd64 / arm64), PostgreSQL next to it:

```bash
cp .env.example .env          # set JWT_SECRET, ENCRYPTION_KEY, ADMIN_EMAIL, ADMIN_PASSWORD
docker compose up -d --build  # → http://localhost:3300
```

Sign in with `ADMIN_EMAIL` / `ADMIN_PASSWORD`: the user is created on the first start, database
migrations run by themselves.

**Just looking?** Add `DEMO_MODE=true` to `.env` before the first start: the login page gets a
"Try the demo" button that opens a made-up account with every section filled — nothing to
connect. Its data is made anew every night; do not use it together with your own.

Put HTTPS in front of it (Caddy, Traefik, nginx) and set `PUBLIC_URL`. A ready server setup with
Caddy, daily backups and one-command updates: [docs/deploy.md](docs/deploy.md). Prebuilt image:
`ghcr.io/romanrostislavovich/personal-dashboard`.

Desktop installers are in [Releases](https://github.com/romanrostislavovich/personal-dashboard/releases)
— [docs/desktop.md](docs/desktop.md). Run a local copy that works offline and syncs with the
server: [docs/sync.md](docs/sync.md).

## Development

```bash
npm install && cp .env.example .env
npm run db:up                 # PostgreSQL in Docker
npm run dev                   # API on :3300 + web on http://localhost:4200
```

Nx · Angular · NestJS · PostgreSQL + Drizzle · pg-boss · grammY · Electron. How it fits together:
[docs/architecture.md](docs/architecture.md) · what is next: [docs/roadmap.md](docs/roadmap.md) ·
how to help: [CONTRIBUTING.md](CONTRIBUTING.md) · security reports: [SECURITY.md](SECURITY.md).

## License

[MIT](LICENSE)

Personal Dashboard is an independent project. It is not affiliated with, endorsed or sponsored
by GitHub, GitLab, Atlassian, WakaTime, Valve, Blizzard, Spotify, Last.fm, SoundCloud, OpenAI,
DeepSeek, Telegram, Hetzner or any other service it connects to; their names, trademarks and
APIs belong to their owners. You connect your own accounts with your own keys and are
responsible for following the terms of each service — including the shops whose pages the
wishlist reads once a day to learn a price.

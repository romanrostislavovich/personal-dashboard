# Roadmap

## ✅ Foundation

- Nx monorepo: Angular + NestJS + Electron, zod contracts, module boundaries enforced by ESLint
- PostgreSQL + Drizzle with automatic migrations, pg-boss for background jobs
- JWT auth, optional registration, profile and password change
- Telegram notifications and bot commands, live events (SSE): web toasts and native desktop notifications
- Desktop app (tray, autostart, server selection), a single Docker image, CI
- English and Russian for the UI, notifications, achievements and AI answers

## ✅ Modules

- **Birthdays** with reminders
- **Finance:** wallets (personal / per project), recurring payments, automatic cost import from
  Hetzner Cloud and DeepSeek
- **Open Source:** GitHub stars history, issues, PRs, releases, npm downloads, alerts
- **Monitoring:** uptime every 5 minutes, response time, SSL expiry, down / up alerts
- **Diary:** visual editor over Markdown (the source is a click away) with autosave, mood,
  hashtags, emoji marks on phrases, photos, search, year heatmap, “on this day”, mood insights,
  templates; `/d`, `/mood`, `/today` and photos from Telegram
- **Music:** Last.fm history and tops, Spotify “now playing”
- **Games:** Dota 2 (full match history of every mode, via OpenDota) and World of Warcraft (Battle.net);
  several accounts per game with a combined view in the spirit of Dotabuff and Raider.IO
- **Weather:** today's forecast for your city (Open-Meteo, no API key) with clothing advice —
  on its page, on the home page and in the morning digest; the city comes from the browser's
  location until you pick another
- **Achievements:** 110+ achievements across all modules, rarities, XP and player level
- **AI:** chat over your data (DeepSeek / OpenAI / Ollama / any OpenAI-compatible API),
  `/ask` in Telegram, morning digest (the weather and only what changed since the previous one),
  weekly diary summary; several saved connections with their keys — switch the active one in one
  click (chat header, settings, `/model` in Telegram)
- **Telegram assistant:** free-form messages go to the AI, which can add, edit and delete almost
  everything the dashboard can (asks before deleting)
- **Saved conversations:** one conversation with the assistant shared by the web chat and
  Telegram, stored on the server (survives reloads and redeploys); earlier ones in the history
- **Files for the AI:** PDF, Excel, CSV and text files in the chat and in Telegram — e.g. a bank
  statement is imported into finance, skipping transactions that are already recorded
- **Sync:** a local instance (works offline) and a server sync both ways; the newer change wins,
  the losing version is kept; rows go in bulk, thousands a second
- **Shared client core** (`@pd/client-core`): session, every API request (core and modules), live
  events and locale in plain TypeScript, used by the web app and ready for a mobile one
- **Main currency:** finance totals, charts and categories converted at the ECB rate of each
  transaction's day; one currency as it is on a click
- **Security:** 15-minute access tokens and an httpOnly refresh cookie, devices signed in (sign one
  or all others out), two-factor sign-in with recovery codes, throttled sign-in; a 30-day trash for
  everything deleted; the AI action log and per-module switches of what the AI sees
- **Data safety:** the computer keeps copies of the server's daily dumps; the server test-restores
  a dump weekly and checks the row counts; the client compares its data with the server's
  (row counts and hashes) every 6 hours and reports a difference, "Resync everything" mends it;
  a conflicts screen (both versions side by side, bring either back); `deploy.sh --rollback`
  (the previous image and the database from before the update)
- **Voice messages in Telegram:** recognized (OpenAI speech-to-text) and handled like typed ones —
  a question or a request to the assistant, the recognized text shown first

## Next

### Planned

- **Password storage** — an encrypted vault for passwords and secrets inside the dashboard
- **Time tracker + Pomodoro** — track time per project or task, Pomodoro sessions with breaks
- **WakaTime** — coding time from WakaTime: per day, project, language and editor
- **Movies and TV shows** — watched and want-to-watch lists, ratings, episode progress for shows
- **Books** — reading list, progress, ratings and notes
- **Fitness** — workouts, activity and body metrics
- **SoundCloud** — my own mixes and tracks: plays, likes, reposts and comments
- **Science** — a section for science
- **Psychology** — a section for psychology; how exactly to tie it in is still open (for example
  mood and diary patterns, self-reflection prompts, tests and notes)

- **Mobile app** that collects data from the phone and sends it to the dashboard — finances first
  (bank notifications / SMS → transactions), then everything else the phone knows:
  - **location tracker** — where you have been, places and trips
  - **sleep** — sleep time and quality, possibly from a fitness band
- **AI with full control of the platform, including its own code.** The assistant can already
  change data through tools; the next step is settings, modules and code. Guard rails before it
  touches code: changes go through a branch and a pull request, CI (lint, tests, build) must pass,
  the user approves every merge and deploy, a deploy can be rolled back in one step, the agent
  runs in a sandbox without production secrets, and every action is written to an audit log.
  Secrets, auth and the guard rails themselves stay out of its reach.
- **AI security agent, 24/7.** A separate agent with its own model connection and read-only
  access that watches the server and the app: failed logins and unusual activity, open ports and
  the firewall, TLS certificates, dependency vulnerabilities (`npm audit`, image scans), leaked
  secrets in the repository, backups actually being made, suspicious changes in the database. It
  reports through notifications with a severity and a suggested fix and never fixes things itself
  without approval. It must not share tools or context with the main assistant, so a prompt
  injection in user data cannot switch it off.

#### Tests and CI

- **End-to-end smoke tests** (Playwright): sign-in, a diary entry, a transaction, an AI message
- **Database tests in CI** — a PostgreSQL service in GitHub Actions, so the `*.db.spec.ts` tests
  run instead of being skipped
- **Dependency updates** (Renovate) and a clean `npm audit`

#### Watching the dashboard itself

- **Self-monitoring** — the dashboard's own health check in the monitoring module; failed
  background jobs, sync errors and AI provider failures reported to Telegram
- **Error log in the UI** — recent server errors without `docker compose logs`

#### Everyday comfort

- **Command palette (Ctrl+K)** — search across modules and quick actions
- **PWA** — install on a phone, work offline (a cheap mobile app before the real one)
- **Customizable home page** — order and hide widgets
- **Telegram buttons** — "Yes / No" to confirm a deletion; quick commands like `/spent 12 coffee`

#### Features

- **Finance:** budgets per category with warnings; a photo of a receipt in Telegram becomes a
  transaction
- **Export of all data** — the diary as Markdown (Obsidian-compatible), finance as CSV,
  everything as JSON
- **Habits** — a habit tracker module, in the digest too
- **Insights across modules** — mood on days with a run, what was playing on bad days (through AI
  tools or core insights: modules do not depend on each other)
- **AI memory** — facts about the user the assistant keeps between conversations
- **AI reminders** — "remind me on Friday to call mum" becomes a scheduled job

### Ideas

- Production projects: errors (Sentry), traffic (Plausible / Umami / Google Analytics),
  Stripe payouts as project income, a monthly report per project
- More cost providers: DigitalOcean, AWS Cost Explorer, Vercel, OpenAI and Anthropic usage
- GitHub repository traffic (views / clones), npm downloads history
- Notification settings: which module sends what and where
- Channels: Discord, e-mail, web push (browser notifications when the tab is closed)
- AI: native Anthropic API, streaming answers
- Roles and sharing for multi-user setups
- A module generator and more language translations
- Far future: buying things and paying for them from the dashboard (and through the assistant),
  with an explicit confirmation of every payment

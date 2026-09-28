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
- **Diary:** markdown with autosave, mood, hashtags, emoji marks on phrases, photos, search, year
  heatmap, “on this day”, mood insights, templates; `/d`, `/mood`, `/today` and photos from Telegram
- **Music:** Last.fm history and tops, Spotify “now playing”
- **Games:** Dota 2 (full match history of every mode, via OpenDota) and World of Warcraft (Battle.net);
  several accounts per game with a combined view in the spirit of Dotabuff and Raider.IO
- **Achievements:** 110+ achievements across all modules, rarities, XP and player level
- **AI:** chat over your data (DeepSeek / OpenAI / Ollama / any OpenAI-compatible API),
  `/ask` in Telegram, morning digest, weekly diary summary; several saved connections with their
  keys — switch the active one in one click (chat header, settings, `/model` in Telegram)
- **Telegram assistant:** free-form messages go to the AI, which remembers the conversation and
  can add, edit and delete almost everything the dashboard can (asks before deleting)
- **Files for the AI:** PDF, Excel, CSV and text files in the chat and in Telegram — e.g. a bank
  statement is imported into finance, skipping transactions that are already recorded
- **Sync:** a local instance (works offline) and a server sync both ways; the newer change wins,
  the losing version is kept

## Next

### Planned

- **Password storage** — an encrypted vault for passwords and secrets inside the dashboard
- **Time tracker + Pomodoro** — track time per project or task, Pomodoro sessions with breaks
- **Movies and TV shows** — watched and want-to-watch lists, ratings, episode progress for shows
- **Books** — reading list, progress, ratings and notes
- **Fitness** — workouts, activity and body metrics
- **SoundCloud** — my own mixes and tracks: plays, likes, reposts and comments
- **Science** — a section for science
- **Morning weather digest** — a weather forecast for where I am, sent in the morning (the
  weather service is not chosen yet)
- **Voice messages in Telegram** — the bot takes voice messages, turns them into text (speech
  recognition) and handles them like a typed message: a diary note, a command, a question to AI
- **Faster sync of large amounts of data** — a client applies changes row by row (about 150 rows a
  second), so catching up on 400,000 plays takes most of an hour; apply a batch per table with a
  few statements instead

- **Mobile app** that collects data from the phone and sends it to the dashboard — finances first
  (bank notifications / SMS → transactions), then everything else the phone knows:
  - **location tracker** — where you have been, places and trips
  - **sleep** — sleep time and quality, possibly from a fitness band
- **Shared client core** for web, desktop and mobile: API client, auth, realtime events, i18n and
  contracts in one library, so every client behaves the same
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

### Ideas

- Production projects: errors (Sentry), traffic (Plausible / Umami / Google Analytics),
  Stripe payouts as project income, a monthly report per project
- More cost providers: DigitalOcean, AWS Cost Explorer, Vercel, OpenAI and Anthropic usage
- GitHub repository traffic (views / clones), npm downloads history
- Notification settings: which module sends what and where
- Channels: Discord, e-mail, web push (browser notifications when the tab is closed)
- AI: native Anthropic API, streaming answers, saved conversations
- Roles and sharing for multi-user setups
- A module generator and more language translations
- Far future: buying things and paying for them from the dashboard (and through the assistant),
  with an explicit confirmation of every payment

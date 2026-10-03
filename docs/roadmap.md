# Roadmap

## ✅ Foundation

- Nx monorepo: Angular + NestJS + Electron, zod contracts, module boundaries enforced by ESLint
- PostgreSQL + Drizzle with automatic migrations, pg-boss for background jobs
- JWT auth, optional registration, profile and password change
- Telegram notifications and bot commands, live events (SSE): web toasts and native desktop notifications
- Desktop app (tray, autostart, server selection, updates itself from the server without an
  installer), a single Docker image, CI
- English and Russian for the UI, notifications, achievements and AI answers

## ✅ Modules

- **Birthdays** with reminders
- **Finance:** wallets (personal / per project), recurring payments, automatic cost import from
  Hetzner Cloud and DeepSeek; monthly budgets per category or for everything, with a warning at
  80% and when spent; a photo of a receipt in Telegram becomes an expense (read by an AI with
  vision), the photo kept with it
- **Life:** one feed of a day across every module (the diary entry, spending, tasks done, time at
  the computer, music, contributions, matches, birthdays) and the summaries of a month or a year;
  on the 1st the AI writes a short story of the past month to Telegram with a link to its page
- **Development:** one section with tabs —
  - **Open Source:** the public repositories of your GitHub, GitLab and Bitbucket accounts and of
    their organizations appear by themselves, any other is added by hand; a table with filters (source, language; forks,
    archived and hidden ones on request) and totals that follow them, stars history, issues, PRs, releases, npm downloads (the package of
    package.json, if npm confirms it is published from this repository); alerts only for the repositories you mark
  - **GitHub account:** contribution calendar by year, streaks, commits / PRs / reviews / issues,
    languages, top repositories, followers; an optional streak reminder in the morning digest
  - **GitLab and Bitbucket accounts:** the same page as for GitHub; the activity calendar is
    built from GitLab events and from Bitbucket commits and pull requests
  - **Summary:** all connected accounts as one — a common calendar and streak, the share of
    each service; the streak reminder of the digest counts all of them
  - **WakaTime:** coding time per day, project, language and editor; every day is copied to the
    dashboard, so the history grows past what the free plan keeps
- **Tasks:** one section with two tabs —
  - **TODO list:** tasks with due dates, priorities, checklists, your own lists and tags, a link
    to a project; repeating tasks; views for today (with the overdue), upcoming, all and done
  - **Reminders:** for a day and time on your own clock (the time zone comes from the device),
    one-off or repeating, about a task or on their own; sent to Telegram with "Done", "+1 hour",
    "Tomorrow" and "Another time" buttons and as notifications; `/todo`, `/remind`, `/tasks`
- **Monitoring:** uptime every 5 minutes, response time, SSL expiry, down / up alerts
- **Diary:** visual editor over Markdown (the source is a click away) with autosave, mood,
  hashtags, emoji marks on phrases, photos, search, year heatmap, “on this day”, mood insights,
  templates; `/d`, `/mood`, `/today` and photos from Telegram
- **Music:** Last.fm history and tops, Spotify “now playing”; your own tracks on SoundCloud —
  plays, likes, reposts and comments saved day by day, alerts about comments and play milestones
- **Games:** Steam (several accounts: level, hours and achievements per game), Dota 2 (the 500 latest
  matches of every mode from Steam, complemented by OpenDota) and World of Warcraft (Battle.net; the current game and Classic: gear, stats, talents,
  Mythic+, raids, PvP, collections, reputations, professions, the guild, the WoW Token price,
  a point of history a day and alerts about a better rating, a boss kill, a new mount);
  several accounts per game with a combined view in the spirit of Dotabuff and Raider.IO;
  refreshed every half an hour and with the "Refresh all" button, an optional OpenDota API key
- **Activity:** time at the computer, recorded by the desktop app (Windows): which program and
  window was in front and for how long, away time left out; per day, program, category, project
  (by the window title) and device; a pause, programs never recorded, the day window by window;
  sent to your server by itself, kept on the computer while there is no connection; focus
  sessions (Pomodoro) from the tray or the page, with distractions noted, a streak and
  achievements; reminders to take a break; daily limits on games, the whole day or a program;
  the disks, load and memory of every computer, with a warning when a disk runs out of space;
  temperature (the board sensor), battery health, graphics, Wi-Fi, disk health, the busiest
  processes; disk cleanup advice from the AI, the picked items moved to the Recycle Bin
- **Weather:** today's forecast and the week ahead for your city (Open-Meteo, no API key) with
  clothing advice that follows how you take the cold —
  on its page, on the home page and in the morning digest; the city comes from the browser's
  location until you pick another
- **Achievements:** 340+ achievements across all modules, rarities, XP and player level
- **AI:** chat over your data (DeepSeek / OpenAI / Ollama / any OpenAI-compatible API),
  `/ask` in Telegram, morning digest at the time you choose (the weather and only what changed since the previous
  one),
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
- **Themes:** light, dark or as the device, six ready-made accents or a colour of your own, a
  black background for OLED screens, font, density, corner radius and the glow; every device
  may keep a theme of its own, "Apply everywhere" makes one the theme of the account
- **Command palette (Ctrl+K):** one field opens any page, switches the theme, adds a task from the
  typed text and searches the data of every module
- **Installable app (PWA):** installs on a phone or a computer; opens without a connection with
  the data seen before; changes of your own records made offline are sent when the server
  answers again; a new version is offered with a "Reload" button
- **Your own home page and menu:** widgets are dragged into place, resized and hidden; whole
  sections are hidden from the menu; per device, "Apply everywhere" makes it the account's
- **Self-monitoring:** Settings → System shows the background jobs with their last runs and the
  server's errors and warnings of the last 14 days; a failed job, a failing sync or AI provider
  and any unhandled error are also reported to Telegram
- **Integration guides:** every integration card explains step by step where to get its key
- **Voice messages in Telegram:** recognized (OpenAI speech-to-text) and handled like typed ones —
  a question or a request to the assistant, the recognized text shown first

## Next

### Planned

- **Habits** — a habit tracker module, in the digest too
- **Sleep, steps, weight** — the first part of Fitness: from Google Fit / Health Connect or typed
  in by hand, shown in Life and in the morning digest
- **Push notifications in the PWA** — on a phone without Telegram (see Everyday comfort)
- **Export and import of all data** — one archive (JSON plus CSV for finance, Markdown for the
  diary) and its import back into an empty or another instance
- **MCP server** — the dashboard exposes its tools over MCP, so Claude Desktop, Claude Code or
  Cursor can read and change your data directly, without its own chat
- **Password storage** — an encrypted vault for passwords and secrets inside the dashboard
- **Time tracker** — track time per project or task (focus sessions are done, see Activity)
- **Desktop: quick input from anywhere** — a global shortcut opens a small window over every
  program: a task, a reminder, an expense, a diary note, without switching to the dashboard
- **Desktop: "now playing" from Windows** — what plays in any player (Spotify, YouTube in a
  browser, Yandex Music, VLC) goes to the music history, even without Last.fm
- **Desktop: game sessions** — the tracker sees a game start and quit: sessions per game
  ("WoW yesterday 21:10–00:40"), and the game's statistics refreshed right after it closes
- **Desktop: a panel in the tray** — a click shows today's tasks, the next reminder, the time at
  the computer and the focus timer in a small window
- **Activity: more trackers** — the tracker of the desktop app watches windows on Windows only;
  macOS and Linux, and the same tracker on a phone (time per app), report to the same section
- **Desktop: more imports from Downloads** — bank statements are offered already; next: photos
  into the diary and other files the app recognizes; nothing is imported without a click
- **Development: self-hosted GitLab** — an instance of your own next to gitlab.com (its address
  with the token); later the tabs of the section may move to their own submenu
- **Dota 2: the whole match history** — the Steam Web API gives only the 500 latest matches;
  the rest needs the Dota 2 Game Coordinator (a sign-in to Steam from the server)
- **Movies and TV shows** — watched and want-to-watch lists, ratings, episode progress for shows
- **Books** — reading list, progress, ratings and notes
- **Fitness** — workouts, activity and body metrics: steps, calories burned and eaten, weight and
  its trend, heart rate; data from smart watches and fitness bands (Apple Health, Google Fit /
  Health Connect, Garmin, Fitbit, Mi Band / Zepp and similar); runs and rides from Strava
- **Science** — a section for science
- **Psychology** — a section for psychology; how exactly to tie it in is still open (for example
  mood and diary patterns, self-reflection prompts, tests and notes)
- **Calendar** — Google Calendar / CalDAV: today's meetings in the morning digest, linked to the
  time tracker and tasks
- **People (personal CRM)** — grows out of Birthdays: notes about people, when you last talked,
  reminders like "you have not written to X for a long time"
- **Health** — your own medical record: blood type, allergies, chronic conditions, vaccinations,
  operations, doctors and their contacts; medications and when to take them, doctor visits, lab
  results with charts (a PDF of the results is parsed by the AI, like a bank statement is today)
- **Documents and deadlines** — passport, insurance, car inspection, warranties, domain renewals,
  with reminders well in advance (domains can live in Monitoring)
- **Investments and net worth** — stocks, crypto, deposits; net worth over time on top of the
  Finance wallets
- **Bookmarks / read later** — links sent to Telegram are saved, the AI writes a short summary,
  full-text search
- **Travel** — a map of countries and cities, trips with their costs from Finance; pairs with the
  location tracker of the mobile app
- **Learning** — courses, languages (Duolingo), flashcards with spaced repetition

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

#### Everyday comfort

- **Push notifications** — in the browser, the desktop app and on phones, next to Telegram;
  switched off per kind of notification or all at once
- **Hidden sections in the digest and notifications** — today hiding a section only takes it out
  of the menu and the home page
- **Telegram:** "Yes / No" buttons to confirm a deletion; quick commands like `/spent 12 coffee`

#### Features

- **Life: more** — weather and steps in the day feed, achievements and the best month by mood
  in the summaries, a yearly story from the AI
- **Automations: webhooks and a public API** with tokens
- **Evening check-in in Telegram** — the bot asks "how was your day?", the answer goes to mood and
  the diary
- **Games:** PlayStation and Xbox — playtime and platform achievements
- **Music and media:** podcasts and YouTube history
- **Insights across modules** — mood on days with a run, what was playing on bad days (through AI
  tools or core insights: modules do not depend on each other). The AI looks for such links across
  all modules (mood, music, activity, fitness, tasks) and shows them in the digest, e.g. "when you
  were sad, you listened to this music and did that"
- **AI memory** — facts about the user the assistant keeps between conversations

### Ideas

- Production projects: errors (Sentry), traffic (Plausible / Umami / Google Analytics),
  Stripe payouts as project income, a monthly report per project
- More cost providers: DigitalOcean, AWS Cost Explorer, Vercel, OpenAI and Anthropic usage
- GitHub repository traffic (views / clones), npm downloads history
- Notification settings: which module sends what and where
- Channels: Discord, e-mail
- AI: native Anthropic API, streaming answers
- Roles and sharing for multi-user setups
- A module generator and more language translations
- Far future: buying things and paying for them from the dashboard (and through the assistant),
  with an explicit confirmation of every payment

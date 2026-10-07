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
  vision), the photo kept with it; subscriptions — monthly or yearly, a free trial with a
  reminder, the old prices, a higher charge in the bank reported, repeating charges suggested as
  subscriptions; savings goals counted from a wallet and money added by hand; the AI's review of a
  month (where the money went, what changed, where to save); a wishlist — a link to a product in
  a shop, its price read from the page every morning and kept day by day, a message when it
  changes (the price is typed in by hand for a shop that does not tell it)
- **Life:** one feed of a day across every module (the diary entry, spending, tasks done, time at
  the computer, music, contributions, matches, birthdays) and the summaries of a month or a year
  (the best month by mood, the top artists, what was left over, achievements); the AI's story of
  a month or a year, sent on the 1st with the finance review; goals of a year counted from the
  modules or by hand; "Ask" — the AI searches one's own history and links the days it found
- **Automations:** rules "if X, then Y" across the modules (a site went down, an expense over an
  amount, a budget running out, no diary entry by a time, overdue tasks, a daily limit, every day
  at a time → a message, a task, a reminder, a line in the diary), made by hand or from a
  sentence the AI turns into a rule
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
- **Export and import:** everything you keep as one ZIP — every record as JSON, the
  transactions as CSV, the diary as Markdown, the photos as files; an archive is brought back
  into this account or another dashboard, adding only what is missing, after a preview of what
  it would add; passwords and the tokens of integrations are never in it
- **Security agent:** a section of its own for the owner — the dashboard (sign-ins, sessions,
  two-factor, the site's certificate and headers, backups, npm audit of the build), the server
  (SSH, the firewall, open ports, updates — an hourly read-only scan on the host), the computers
  with the desktop app (antivirus, firewall, disk encryption, updates) and the connected code
  hostings (two-factor sign-in and the token of GitHub, GitLab and Bitbucket; Dependabot and
  secret scanning alerts of your GitHub repositories); addresses your own signed-in devices use
  are taken for yours; rules check every hour, an AI investigates the same facts every morning
  through read-only tools of its own and writes a report; each finding has a severity, a fix
  and, on request, the AI's step-by-step guide for that very case; the agent itself changes
  nothing
- **Self-monitoring:** Settings → System shows the background jobs with their last runs and the
  server's errors and warnings of the last 14 days; a failed job, a failing sync or AI provider
  and any unhandled error are also reported to Telegram
- **Integration guides:** every integration card explains step by step where to get its key
- **Voice messages in Telegram:** recognized (OpenAI speech-to-text) and handled like typed ones —
  a question or a request to the assistant, the recognized text shown first

## Next

Split by priority: **Now** is what comes first (safety of the data before more sensitive data
arrives, and quick wins), **Next** is the following round, **Later** is the rest of the plan.

### Now

#### Data and security

- **Encryption of sensitive data** — the diary, the medical record, notes about people and the
  password vault are stored encrypted; for such modules the AI can be limited to a local model
  (Ollama), so they never go to an outside API
- **Encrypted off-site backup** — the daily dump encrypted and sent to Backblaze B2 or S3, so the
  data outlives the server
- **Integration status** — one screen with the last successful refresh of every integration and
  the tokens that expire soon (Spotify, Battle.net, GitLab...), with a warning before an
  integration breaks

#### Tests and CI

- **End-to-end smoke tests** (Playwright): sign-in, a diary entry, a transaction, an AI message
- **Dependency updates** (Renovate)

#### Quick wins

- **Hidden sections in the digest and notifications** — today hiding a section only takes it out
  of the menu and the home page
- **Telegram:** "Yes / No" buttons to confirm a deletion; quick commands like `/spent 12 coffee`
- **Evening check-in in Telegram** — the bot asks "how was your day?", the answer goes to mood and
  the diary
- **Life: more** — weather and steps in the day feed

### Next

#### Everyday use

- **Finance: the bank directly (open banking)** — transactions come from the bank every day
  (GoCardless Bank Account Data: free in the EU, mBank, PKO, Revolut), no statements needed;
  budgets, subscriptions and rules pick them up
- **Notification centre and quiet hours** — the history of every notification with filters;
  nothing at night, one summary in the morning; minor ones gathered into one message an hour
- **Push notifications** — in the browser, the desktop app and on phones (the PWA, without
  Telegram), next to Telegram; switched off per kind of notification or all at once
- **Habits** — a habit tracker module, in the digest too
- **Weekly review on Sunday** — the AI sums up the week across the sections and asks 2–3
  questions; the answers go to the diary, the main thing of the next week to the tasks
- **Challenges of the week** — every Monday three personal challenges from the user's own data
  ("2 focus sessions a day", "at most 10 h of games", "5 diary entries"), a result and XP at the end
- **Tilt detector** — three Dota losses in a row or two hours of games after midnight → a gentle
  "maybe enough?"; win rate by the time of day and after N matches in a row
- **Sleep from the computer** — the last activity at night and the first in the morning give an
  estimate ("slept ~6 h, went to bed at 2:40"), a weekly trend, in Life; the phone refines it later
- **Sleep, steps, weight** — the first part of Fitness: from Google Fit / Health Connect or typed
  in by hand, shown in Life and in the morning digest
- **Weather: more** — air quality and pollen; days off and public holidays in the digest
- **Shopping list** — items added from Telegram ("milk, bread") or the page, grouped by shop or
  category, ticked off in the shop; ingredients of a recipe added in one click; can be shared
  with someone at home
- **Parcel tracking** — InPost, DHL, Poczta Polska, Nova Poshta and others: send a tracking
  number to Telegram (or it is picked up from Gmail), status changes arrive by themselves, the
  parcels on the way in the digest

#### Development and monitoring

- **A public status page** — for the sites of Monitoring, the user picks which are shown
- **More checks** — a heartbeat for cron jobs (in the spirit of healthchecks.io: an alert when a
  job did not report in time), DNS, a keyword on the page, ping
- **CI status of the repositories** — failed GitHub Actions and deploys shown in Development and
  in the digest

#### Desktop

- **Desktop: quick input from anywhere** — a global shortcut opens a small window over every
  program: a task, a reminder, an expense, a diary note, without switching to the dashboard
- **Desktop: voice notes** — a shortcut, speak, the text (speech recognition) goes to the diary or
  a task
- **Desktop: a panel in the tray** — a click shows today's tasks, the next reminder, the time at
  the computer and the focus timer in a small window
- **Desktop: "now playing" from Windows** — what plays in any player (Spotify, YouTube in a
  browser, Yandex Music, VLC) goes to the music history, even without Last.fm
- **Desktop: game sessions** — the tracker sees a game start and quit: sessions per game
  ("WoW yesterday 21:10–00:40"), and the game's statistics refreshed right after it closes
- **Desktop: more imports from Downloads** — bank statements are offered already; next: photos
  into the diary and other files the app recognizes; nothing is imported without a click

#### New modules

- **Password storage** — an encrypted vault for passwords and secrets inside the dashboard
- **Health** — your own medical record: blood type, allergies, chronic conditions, vaccinations,
  operations, doctors and their contacts; medications and when to take them, doctor visits, lab
  results with charts (a PDF of the results is parsed by the AI, like a bank statement is today)
- **Time tracker** — track time per project or task (focus sessions are done, see Activity)
- **Calendar** — Google Calendar / CalDAV: today's meetings in the morning digest, linked to the
  time tracker and tasks

#### AI and links between modules

- **Better monitoring through links between modules** — what one module knows shown where
  another needs it, first Activity and Development: Activity already tells which project the
  time at the computer went to (by the window title), Development knows its repositories and
  commits — so a project shows its hours next to its commits, and a day of work is one picture.
  Modules still do not depend on each other: the core joins them
- **AI memory** — facts about the user the assistant keeps between conversations
- **MCP server** — the dashboard exposes its tools over MCP, so Claude Desktop, Claude Code or
  Cursor can read and change your data directly, without its own chat

#### For new users

- **Demo mode** — a start with sample data and a public demo instance, so the project can be
  tried before installing it
- **First-run wizard** — pick the sections you need, the time zone, connect Telegram
- **Import from other apps** — Daylio / Day One (diary), Todoist (tasks), Toggl (time), CSV of
  other banks; makes moving in easy

### Later

#### Modules

- **Fitness** — workouts, activity and body metrics: steps, calories burned and eaten, weight and
  its trend, heart rate; data from smart watches and fitness bands (Apple Health, Google Fit /
  Health Connect, Garmin, Fitbit, Mi Band / Zepp and similar); runs and rides from Strava
- **People (personal CRM)** — grows out of Birthdays: notes about people, when you last talked,
  reminders like "you have not written to X for a long time"
- **Documents and deadlines** — passport, insurance, car inspection, warranties, domain renewals,
  with reminders well in advance (domains can live in Monitoring)
- **Investments and net worth** — stocks, crypto, deposits; net worth over time on top of the
  Finance wallets
- **Movies and TV shows** — watched and want-to-watch lists, ratings, episode progress for shows
- **Books** — reading list, progress, ratings and notes
- **Bookmarks / read later** — links sent to Telegram are saved, the AI writes a short summary,
  full-text search
- **Travel** — a map of countries and cities, trips with their costs from Finance; pairs with the
  location tracker of the mobile app
- **Learning** — courses, languages (Duolingo), flashcards with spaced repetition
- **Science** — a section for science
- **Psychology** — a section for psychology; how exactly to tie it in is still open (for example
  mood and diary patterns, self-reflection prompts, tests and notes)
- **Car** — mileage, refuelling and fuel use, service by intervals; the costs go to Finance by
  themselves
- **Utilities and meters** — a monthly reminder to read the meters (a photo, the AI reads the
  numbers), charts of use and costs
- **Recipes** — your own recipes with ingredients and steps, tags and search
- **Digital legacy** — if you do not sign in for N days, a chosen person gets access to what you
  allowed (e.g. a part of the password vault); warnings first, and it can be cancelled

#### Integrations

- **Google services** — one Google sign-in (OAuth) for all of them: Calendar (the Calendar
  module), Fit / Health Connect (sleep, steps, weight), Gmail (bills and receipts into Finance,
  important letters in the digest), Drive (backups and files for the AI), Photos (photos of a day
  in the diary and Life), Tasks (synced with the TODO list), YouTube (watch history), Maps
  Timeline (places and trips for Travel)
- **Notion** — an integration with Notion (API token): import pages and databases (notes,
  tasks, reading lists) into the matching modules, a two-way sync of tasks, the AI can search
  your Notion pages
- **Home Assistant** — the smart home: power use, sensors, the state of the house in the morning
  digest
- **Development: self-hosted GitLab** — an instance of your own next to gitlab.com (its address
  with the token); later the tabs of the section may move to their own submenu
- **Dota 2: the whole match history** — the Steam Web API gives only the 500 latest matches;
  the rest needs the Dota 2 Game Coordinator (a sign-in to Steam from the server)
- **Games:** PlayStation and Xbox — playtime and platform achievements
- **Music and media:** podcasts and YouTube history
- **Your own channels** — statistics of your YouTube, Twitch or Telegram channel, like SoundCloud
  already has: subscribers, views, comments day by day
- **Activity: more trackers** — the tracker of the desktop app watches windows on Windows only;
  macOS and Linux, and the same tracker on a phone (time per app), report to the same section
- **Wishlist: more** — a wish feeds a savings goal; shops that turn a server away (Media Expert,
  Decathlon, Amazon, Allegro) through their APIs or the desktop app's browser
- **A public /now page** — a link to share: what I listen to, play and work on, my GitHub; the
  user picks what is shown

#### Across modules

- **Insights across modules** — mood on days with a run, what was playing on bad days (through AI
  tools or core insights: modules do not depend on each other). The AI looks for such links across
  all modules (mood, music, activity, fitness, tasks) and shows them in the digest, e.g. "when you
  were sad, you listened to this music and did that"
- **Automations: more triggers and actions** — matches, a new release, a birthday today; a
  transaction or a diary mood as an action
- **Automations: webhooks and a public API** with tokens
- **An AI agent for every module, and one over them all** — each module gets an agent of its
  own that knows its data and tools in depth (finance, the diary, development, activity…), and a
  general one that takes a question, hands its parts to the agents concerned and puts their
  answers together; the security agent already works apart like this

#### Big steps

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
- **Security agent: more** — a phone once there is a mobile app; scans of the Docker image;
  suspicious changes in the database; macOS and Linux computers; the hosting's own firewall
  (the scan of the server sees only the one on the host)

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

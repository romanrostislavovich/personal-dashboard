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

- **Birthdays** with reminders, and days of memory: a person may have the day they died — a
  quiet reminder on the day and the day before, and their birthday told on the day only, in
  other words
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
  modules or by hand
- **Automations:** rules "if X, then Y" across the modules (a site went down, an expense over an
  amount, a budget running out, no diary entry by a time, overdue tasks, a daily limit, every day
  at a time → a message, a task, a reminder, a line in the diary), made by hand or from a
  sentence the AI turns into a rule
- **Development:** one section with tabs —
  - **Repositories:** the repositories of your GitHub, GitLab and Bitbucket accounts and of
    their organizations appear by themselves, open source and private, any other is added by hand; a table with filters (source, visibility — open source or private, language; forks,
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
- **Health: the ICE card** — whom to call, the blood type, the allergies, the conditions and the
  medications, printed or as a picture for the lock screen with a QR code
- **A review of the week** on Sundays — the AI looks back at the week across the sections and
  asks 2–3 questions; the answers go to the diary
- **Health (first stage):** one medical history across countries and clinics — visits,
  diagnoses by ICD code gathered into conditions with their history, medications by brand and
  active substance, scans and PDFs of the documents; stored encrypted; the ICD-10 dictionary
  downloaded from WHO by the user's own server (see the plan in [health.md](health.md))
- **Passwords:** a password vault like 1Password — logins and secure notes encrypted on the
  device with a key of the master password, so the server and the AI keep only ciphertext; a
  recovery key shown once, locks itself after 10 minutes, a password generator and a strength
  meter; a Chrome extension fills the logins of a page, offers to save new ones and makes
  passwords (installed by hand, updated by the desktop app)
- **Apps:** Settings → Apps — installers from your own server, and every device with the version
  of its app
- **Habits:** quitting or cutting down alcohol, smoking or one's own — the run of clean days
  from "I quit", days marked on the page, by an evening question in Telegram or by the
  assistant; achievements from a day to a thousand days. Habits to build too (every day or a
  few days a week), and the runs in the morning digest
- **Monitoring:** uptime every 5 minutes, response time, SSL expiry, down / up alerts
- **Psychology:** a questionnaire on a schedule (a reminder in Telegram); watching oneself over time — the patterns of the mood (by the day of the week,
  week by week, low stretches, the mood during the events of a life), short standard
  questionnaires with their history (WHO-5, GAD-7, PHQ-9 — never a diagnosis), and events with
  their periods or the age they happened at, saved as an Excel workbook or a Word document
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
  processes; disk cleanup advice from the AI, the picked items moved to the Recycle Bin; a
  computer the app cannot be installed on (a work laptop) is counted from WakaTime — its time
  in an IDE is added to the time at the computer, a computer with the tracker is not counted
  twice
- **Weather:** today's forecast and the week ahead for your city (Open-Meteo, no API key) with
  clothing advice that follows how you take the cold —
  on its page, on the home page and in the morning digest; the city comes from the browser's
  location until you pick another
- **Achievements:** 400+ achievements across all modules, rarities, XP and player level; in
  Health and Psychology only care counts — medications taken on time, a diagnosis taken off, a
  questionnaire month after month — never an illness or a score
- **AI:** chat over your data (DeepSeek / OpenAI / Ollama / any OpenAI-compatible API), which
  also searches your own history ("when was I in Prague?") and links the days it found,
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

#### Done from this list

- ✅ **Encryption of sensitive data** — the diary, the medical record, notes about people and the
  password vault stored encrypted (the vault on the device, with the master password); the AI of
  such sections can be limited to a local model (Ollama)
- ✅ **Health** — every stage of [health.md](health.md): one history across countries and
  clinics, ICD diagnoses gathered into conditions (and taken off: recovered, ruled out, in
  remission), lab results, documents read by the AI, a summary for a new doctor, the profile,
  medication reminders
- ✅ **Tests and CI** — end-to-end smoke tests (Playwright) on the built image, Renovate
- ✅ **Reliability** — background jobs send nothing twice; every outside call gives up after 30
  seconds; the missing indexes (migration 0073); `/api/health` checks the database and the jobs;
  the trash keeps only what a person deleted; sign-in hardening and limits on what costs; the
  image is published only after CI passes; the desktop queue survives a crash; every write
  names the user

- ✅ **Quick wins** — hidden sections stay out of the digest and the notifications; "Yes / No"
  buttons under a question to confirm in Telegram and `/spent 12 coffee`; the weather in the Life
  feed; the achievements measured six at a time; the side menu in groups
- ✅ **Notifications through an outbox** — sent once within a window, retried with a backoff
  (Telegram's `retry_after` too), the delivery log in Settings → Integrations
- ✅ **Telegram: long messages are split** instead of cut at 4096 characters
- ✅ **AI: the prompt cache works** — the time goes last in the system prompt
- ✅ **AI: what it costs** — tokens per connection, model and day; the spend with the prices; a
  monthly limit; background work falls back to Ollama
- ✅ **MCP server** — the assistant's tools for Claude Desktop, Claude Code and Cursor with
  access tokens (read / read and change); devices add tools of their own (the page in front, the
  tabs, the window in front); the assistant beside the page in the extension's side panel
- ✅ **Writing** — LanguageTool on the server and the AI's rewrites; the Writing page, the
  browser extension in every field (as Grammarly: the badge from the focus, the panel with the
  mistakes, "fix all", "not on this site"), the desktop app in every program (UI Automation)
- ✅ **Screenshots** — the editor of Ctrl+Alt+S (arrows, boxes, text, numbers, pixelation), a
  folder of every computer synced with the server, the Screenshots page
- ✅ **Music: share a song** — open it in YouTube Music or Spotify, copy the link, send it
- ✅ **Browser extension: time by site and focus mode** — the time on each site in Activity and
  for the assistant; distracting sites closed during a focus session; daily limits of sites

#### Quick wins

- **Life: steps** — in the day feed, once the steps come from somewhere (a phone, a band)

### Next

#### Everyday use

- ✅ **Finance: the bank directly (open banking)** — Enable Banking (GoCardless Bank Account
  Data takes no new customers since July 2025): the owner's application, each user's bank with
  the bank's own sign-in, the accounts chosen, the operations every six hours as transactions —
  matched with the ones typed by hand, transfers between one's own accounts left out, the
  category by the counterparty or the AI; a reminder a week before the consent ends
- **Finance: net worth and runway calculation** — total net worth tracking, monthly burn rate,
  and emergency fund runway in months of autonomy based on current spending velocity
- **Finance: subscription and leak audit** — automated detection of creeping price increases,
  hidden or forgotten recurring charges, and warnings before renewal dates
- **Finance: subscription action hub** — critical date calendar for contract renewals, price lock
  expirations, and service terms (rent, internet, B2B tools, insurance) with AI-generated
  cancellation and renegotiation draft letters in English and Polish
- **Health: prescriptions into interactive tasks** — medical recommendations and prescriptions
  converted directly into tasks and interactive Telegram reminders with dosage confirmation buttons
- **Quick capture (2-second rule)** — minimal global entry (desktop hotkey and mobile PWA
  shortcuts) with instant natural language parsing ("15 coffee", "headache right side",
  "doctor tomorrow at 14:00") to eliminate recording friction
- **Notification centre and quiet hours** — the history of every notification with filters;
  nothing at night, one summary in the morning; minor ones gathered into one message an hour
- **A calendar feed (ICS)** — a private link with the birthdays, days of memory, reminders, due
  dates of tasks, subscription charges and the end of free trials, subscribed to in the calendar
  of a phone
- **Push notifications** — in the browser, the desktop app and on phones (the PWA, without
  Telegram), next to Telegram; switched off per kind of notification or all at once
- **Challenges of the week** — every Monday three personal challenges from the user's own data
  ("2 focus sessions a day", "at most 10 h of games", "5 diary entries"), a result and XP at the end
- **Psychology: a gentle warning** — when the results of a questionnaire stay worse for several
  times in a row (never a diagnosis), a quiet message with where to get help, the contacts of
  your own doctor first if Health has them
- **Psychology: the events of a life on the chart of the mood** — the periods of the events laid
  over the mood and the questionnaires, to see what went along with what
- **Energy and cognitive load tracker** — a 5-point physical and mental energy rating in quick
  check-ins (Body Battery); automatic cognitive load scoring based on window context switches,
  commit frequency, and focus session lengths
- **Emergency offline runbook** — a password-protected compact offline PWA/PDF bundle with critical
  emergency data (ICE card, insurance policies, active prescriptions, ID document copies, emergency
  credentials) accessible on a mobile device without network or when the self-hosted server is offline
- **Tilt detector** — three Dota losses in a row or two hours of games after midnight → a gentle
  "maybe enough?"; win rate by the time of day and after N matches in a row
- **Sleep from the computer** — the first and the last activity of a day are known already (and
  compared with the mood); next: an estimate out of them ("slept ~6 h, went to bed at 2:40"), a
  weekly trend, in Life; the phone refines it later
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
- **Developer impact hub and portfolio generator** — aggregated open-source and professional impact
  tracking (npm download dynamics, GitHub star growth velocity, mentoring hours); one-click
  generation and export of an up-to-date Markdown/HTML resume and portfolio from repository metrics
  and verified profile data

#### Engineering

- **Sync across versions** — today any difference of the migrations stops sync; a peer whose
  migrations are the start of yours is accepted, the status says "the server is N migrations
  ahead", and a notification tells when the two drift apart
- **Data portability and open formats** — continuous standardized export (Markdown, JSON-LD,
  CSV/Parquet) for vendor independence and offline accessibility without running the backend
- **`updatedAt` on every table a user edits** — "edited at" in the UI and a check that the AI and
  a second tab do not overwrite each other's change (If-Match)
- **Observability** — JSON logs in production with a request or job id; `/metrics` (job runs,
  AI calls and tokens, sync lag, failed notifications)
- **Loading and errors are not "empty"** — a shared `<pd-resource-state>`: a list shows "No …
  yet" today while it loads or after a failed request; the actions of the AI page report errors
- **Accessibility** — `aria-label` on the 28 icon-only buttons without one, the accessibility rules
  of angular-eslint; the last hardcoded texts and status colours go to Transloco and theme tokens
- **Smaller components** — the diary editor (845 lines), the WoW dashboard, the security page,
  Psychology's events, the AI settings: templates and styles in their own files, parts split out
- **Tests where there are none** — the web libraries (pure helpers first: finance stats, the
  activity timeline, months, the repository filter) and the desktop app (the span builder, the
  private-window rules — the same as `isMeetingTitle` of contracts, the focus timer); lint for
  the desktop app
- **CI and tooling** — the Nx cache kept between runs, `format:check`, `.nvmrc` / `engines`,
  `affected` and `typecheck` scripts
- **A module generator** — `nx g @pd/tools:module`: the api and web libraries, contracts, the
  requests of the client core, i18n and the registration in one command instead of ten steps

#### Browser extension

##### Now / quick wins

- **Browser companion positioning** — the extension becomes the Personal Dashboard browser
  companion, not only a password manager: Vault, Capture, Focus / Activity and AI Context in one
  small tool
- **Wishlist in one click** — "To the wishlist" on a product page: the name and the price read
  from the page, then Finance watches the price as it does today
- **Select price manually** — when the extension cannot find the product price, the user can click
  the price on the page and save the selector or value for that wishlist item
- **Wishlist improvements** — detect product name, price, image, currency, stock state, variants
  and discounts; allow "notify below this price", "back in stock" and linking a wish to a savings
  goal
- **From the context menu** — the selected text to a task or the diary, the page to "read later"
  (a task with its link), the site to Monitoring
- **Universal quick capture** — one click or shortcut from any page to add selected text, the
  current URL or a screenshot to a task, diary entry, read-later item, Monitoring target,
  Wishlist item or an AI question
- **Ctrl+K in any tab** — the dashboard's search and commands without switching to it: search
  tasks, diary, read-later items and passwords; add tasks and expenses; start focus sessions;
  ask AI; open modules; fill passwords; save pages; add wishlist items and monitored sites
- **AI side panel for the current page** — a browser side panel that can summarize the current
  page, explain selected text, extract tasks, find prices or subscription terms, save key points
  to the diary and ask the dashboard assistant with explicit user approval
- **AI page privacy controls** — page content is never sent automatically; the user can send only
  selected text, the readable article or the whole page, with allowlists, denylists and private
  windows ignored
- **Subscriptions at checkout** — on the page that sells a subscription, an offer to add it to
  Finance → Subscriptions with its price and period
- **Subscription detector** — recognize checkout and pricing pages with monthly, yearly, trial and
  renewal terms; suggest adding the subscription to Finance with price, currency, period, renewal
  date, cancellation URL and a reminder before the trial ends
- **Ask dashboard about this page** — a command that sends selected page context to the assistant
  and can save the answer, create tasks, add diary notes or link the page to a project
- **Receipt and invoice import from the browser** — import an order page, invoice page or PDF as a
  Finance expense, with merchant, amount, currency, date, category, project and the original file
  or screenshot attached
- **Sites and habits** — a habit like "social media" counts a visit to such a site as a day
  with it (time by site and focus mode are done)
- **Focus mode improvements** — block URL patterns and not only domains, add temporary exceptions
  with a reason, "allow 5 minutes", hard mode until the end of a focus session, break mode
  allowlists and a blocked page that shows the current focus task

##### Next

- **Smart read later and bookmarks** — save pages with title, author, canonical URL, reading time,
  clean article text, AI summary, tags, full-text search and reminders to read later
- **Browsing history** — the pages visited (the address, the title, when and how long) kept
  encrypted, never from private windows, with sites left out and a time to keep them; searched
  from Ctrl+K and asked of the assistant ("the article about X I read last week"), the sites of
  a day in Life
- **Browser activity intelligence** — categorize domains as work, social, video, shopping, docs,
  news and other; show context switching, repeated distractions, focus interruptions and the
  sites most connected with low productivity
- **Project-aware browsing** — attach domains, GitHub repositories, documentation, staging sites,
  admin panels and billing pages to Projects, so browser time and saved pages are linked to the
  right project
- **Client-side checks for Monitoring** — add the current site to Monitoring and optionally test
  it from the browser too: page load, blank screen, broken assets, redirect loops, certificate
  warnings, mixed content and basic Web Vitals
- **Frontend error collector for own sites** — on allowlisted domains owned by the user, collect
  console errors, uncaught exceptions, failed network requests, route, browser info and screenshot;
  create a task or Monitoring incident from them
- **Security assistant in the browser** — warn about HTTP login forms, suspicious lookalike
  domains, password reuse, weak passwords, pages that ask for recovery codes and unsafe login
  forms
- **Secret paste warning** — when the user pastes something that looks like an API key, JWT,
  private key, npm token, GitHub token or `.env` content into a web page, ask for confirmation
  before the paste continues
- **Vault health in the popup** — show reused, weak, old and potentially compromised passwords,
  saved sites without two-factor authentication and logins saved for insecure HTTP pages
- **TOTP autofill** — store TOTP secrets encrypted in the vault, show one-time codes in the
  popup, fill detected OTP fields and support multiple accounts on the same domain
- **Identity autofill** — encrypted personal profiles for filling name, address, phone, company,
  tax ID and social links, with separate personal, business and minimal profiles
- **Domain aliases and custom matching rules** — allow the user to define which domains belong to
  the same login and which domains must never share credentials
- **Safer clipboard handling** — after copying a password or TOTP code, clear the clipboard after
  a short time if it still contains the copied secret
- **Webmail capture by explicit action** — from Gmail, Outlook, Proton and other webmail pages,
  selected text or the current message can become a task, reminder, finance document, parcel
  tracking item, health visit or AI question without automatic mailbox reading
- **Parcel tracking from selected text** — detect tracking numbers in selected text or pages and
  add them to Parcel tracking with a guessed carrier or a user-picked one
- **Warranty and return-window capture** — when a purchase page contains warranty or return
  deadlines, save them as document reminders or tasks
- **Explain this bill** — on billing pages for cloud, AI, hosting and SaaS providers, import or
  analyze the bill, detect what changed, connect the cost to a project and create Finance records
- **Extension privacy dashboard** — show which permissions are enabled, which domains are allowed
  or ignored, what was sent to the server, browsing-history status, retention period, last sync
  and a button to delete browser-collected data
- **Progressive permissions** — request browser permissions only when the matching feature is
  enabled: forms for the vault, activeTab for capture, tabs for sessions, history only for
  encrypted browsing history, and host permissions only for allowlisted domains
- **Never collect here** — a one-click deny rule for the current site; banks, government portals,
  medical portals, adult sites, password reset pages and webmail are excluded by default unless
  explicitly enabled

##### Later

- **Web media history** — track YouTube, YouTube Music, Spotify Web, SoundCloud, Bandcamp, Twitch
  and podcast pages as browser media activity, with title, artist or channel, URL and duration
- **Browser now playing** — send the currently playing browser media to Music as a fallback or
  complement to Last.fm, Spotify and the desktop app
- **Meeting detector** — detect Google Meet, Zoom and Teams web meetings, record them as Activity,
  link them to a project or calendar item and offer to save notes or create follow-up tasks after
  the meeting
- **Localhost and staging helper** — on localhost, staging and own domains, quickly attach the
  page to a project, capture Angular or frontend errors, save screenshots and create bug tasks
- **Tab sessions** — save the current browser window as a named session, link it to a project,
  restore it later, summarize open tabs, close duplicates and ask the assistant what the user was
  researching
- **Learning mode** — save articles, docs, videos and courses to a learning plan, track reading
  or watching time, extract flashcards and generate small quizzes from the current page
- **Gentle anti-procrastination** — detect long distraction sessions, repeated social media opens
  during focus, late-night browsing and daily limits, then suggest breaks or blocking without
  guilt-driven wording
- **Health document capture** — from medical portals, explicitly save appointment details,
  prescriptions, lab PDFs and recommendations into Health, tasks or medication reminders

#### Desktop

- **Writing: Ctrl+Alt+G where there are no marks** — in a program that gives no positions of
  its words (Telegram Desktop and other Qt apps): the selected text is checked and rewritten in a
  small window, and put back in its place
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

- **Time tracker** — track time per project or task (focus sessions are done, see Activity)
- **Calendar** — Google Calendar / CalDAV: today's meetings in the morning digest, linked to the
  time tracker and tasks

#### AI and links between modules

- **AI memory** — facts about the user the assistant keeps between conversations
- **Local semantic search & RAG** — vector embeddings (`pgvector` or `sqlite-vec`) across personal
  history (diary entries, medical records, notes, past tasks) for semantic recall ("when did I last have
  these symptoms?" or "how did I resolve that issue two years ago?")
- **Nightly AI housekeeping** — zero-cost local LLM (Ollama) background jobs during the night for
  routine maintenance: auto-categorization of uncategorized transactions, diary tag deduplication and
  linking, associating orphan tasks with projects, and drafting a crisp morning briefing without cloud
  API token costs
- **MCP: Claude.ai connectors** — OAuth sign-in for the custom connectors of claude.ai and the
  Claude phone apps (the MCP server itself is done, with access tokens)
- **AI: fewer tools a request** — all ~97 tools go with every request and every round today; the
  modules a question needs are picked first, and only their tools are offered (cheaper, and small
  Ollama models choose better)
- **AI: a budget for the history** — a file is sent again in every round of the next 20
  messages (up to 180k characters); after its turn a file becomes a short summary, the oldest
  turns are dropped over the budget
- **AI: outside text is data, never orders** — window titles, product names from shops, commit
  messages reach the model as they are while 46 tools can change data; tool results are marked as
  untrusted, and no writes in a turn that read outside text unless the user asked for a change
- **AI: robust answers** — an answer cut by the length limit is continued or marked; retries with
  a backoff on 429 / 5xx; a backup connection when the active one fails; a time limit for one
  answer; one answer at a time in a conversation (the web chat and Telegram share it); the state
  of a confirmation kept in the database
- **AI: undo** — "undo the last change of the assistant" in the chat and `/undo` in Telegram, out
  of the action log and the trash
- **AI: progress while it works** — "looking at finance…", "searching the diary…" over the live
  events, before streaming the answer itself
- **AI: what it read** — the action log also keeps which read tools of which modules were called

#### For new users

- **A public demo instance** — the demo mode is there (`DEMO_MODE=true`: a made-up account with
  every section filled); what is left is to host one and link it from the README
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
- ✅ **Causal correlation engine** — Life → Links: every daily number of every section against
  every other, of the same day and of the next one (Spearman, corrected for the days' own trends
  and for the number of pairs), "comes before" when it tells about tomorrow beyond tomorrow's own
  yesterday, a regression of what predicts a chosen number; the strongest links in words, a
  graph, a matrix and a pair day by day; the assistant's `core_correlations`. New daily numbers
  for it: every habit, GAD-7 / PHQ-9 / WHO-5, games late at night, spending by category, commits,
  words in the diary, Dota 2 matches
- ✅ **Before and after** — Life → Links: every daily number around the start or the end of a
  period of Health (a diagnosis, a medication), judged against the ordinary dates of the same
  history; the assistant's `core_before_after`
- **Correlation engine: sleep** — the hours and the time of going to bed, once a source of sleep
  (a phone, a watch) is connected
- **Automations: more triggers and actions** — matches, a new release, a birthday today; a
  transaction or a diary mood as an action
- **Automations: webhooks and a public API** with tokens
- **Automations: an incoming webhook** — `POST /api/hooks/:token` from iOS Shortcuts, IFTTT,
  Home Assistant or GitHub Actions is a trigger of a rule
- **Automations: a question to the AI on a schedule** — "every Friday: how much did I spend on
  food this week?", the answer to Telegram (today a rule sends only a fixed text)
- **An AI agent for every module, and one over them all** — each module gets an agent of its
  own that knows its data and tools in depth (finance, the diary, development, activity…), and a
  general one that takes a question, hands its parts to the agents concerned and puts their
  answers together; the security agent already works apart like this

#### Data and storage

- **Encrypted off-site backup** — the daily dump encrypted and sent to Backblaze B2 or S3, so the
  data outlives the server (today it is kept on the server and on the computer of the sync)
- **Attachment storage** — photos are made small already; the files themselves (scans, receipts,
  photos of the diary) moved out of PostgreSQL to the file system or S3, so the database does
  not grow with them over the years

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

# Changelog

Notable changes of every release. The versions follow [Semantic Versioning](https://semver.org/);
before 1.0 a minor version may bring changes that need attention when updating — they are listed
under **Updating**.

## Unreleased

### Added

- **Pictures in the assistant** — a screenshot or a copied picture is pasted with Ctrl+V into
  the AI chat and into the extension's side panel (which can now attach files too, also with a
  clip button); a picture can be chosen as a file as well and sent to the Telegram bot as a file.
  The connection that reads pictures (Settings → AI) writes down its text and what it shows, and
  the chat model gets that with the question — so any chat model works with pictures. A paste
  that carries text (a copy from Excel or Word) stays text.
- **Net worth and runway** — Finance → Overview: the bank accounts count by themselves, cash,
  other accounts, deposits, investments, property and debts are typed in ("Assets and debts");
  the total with its change over 30 days and a point a day, the average spending of the last
  full months and for how many months the money at hand would last. The AI's
  `finance_net_worth`.
- **The check of the subscriptions** — Finance → Recurring: a price that crept up over the year
  (in the bank or in a payment's history), a subscription charged twice in a month, one paid for
  and not used, a repeating charge never recorded, a renewal or a notice deadline within a month,
  each with what it costs a year.
- **Contracts and key dates** — a recurring payment may have its contract: the term, the notice
  in days, a fixed price until a day, renewing by itself or not; the end of the term and the last
  day to give notice are counted (the start taken from the first charge when not given). A
  calendar of key dates a year ahead, reminders two weeks before a notice deadline and a week
  before a renewal or the end of a fixed price, and a letter to cancel or to ask for a better
  price in English or Polish written by the AI (a plain template without one). The AI's
  `finance_key_dates`.
- **The wishlist in one click** — the extension's popup on a product page offers "To the
  wishlist": the name, the price and the picture are read in the browser, so shops that turn the
  server away are read too; a page already in the list gets the price seen there.
- **One look for every chart** — shared chart tokens and classes (tooltip, scale marks, legend):
  the bar charts of Activity, WakaTime and Development get gridlines with a round scale and a
  tooltip on hover, the sparklines and the lab charts the same tooltip as the cash flow, the
  diary's mood bars the same corners; whole hours read "5 h", not "5 h 0 min".
- **A round of the UI** — home widgets of sections not set up yet (no Last.fm, no game
  accounts, no sites, no habits) gather into one "Not set up yet" line instead of empty cards,
  and every widget's link reads "Open"; empty sections (Habits, Achievements, Security, AI) get
  a page of what they are for and the first thing to do, the AI with example questions;
  Life → Day shows the day's cards and a timeline of its hours; Finance gathers its imports into
  one "Import" menu, adds with a button over the page on a phone and starts the cash-flow chart
  at the first month with money; Health shows the next visit on top; Psychology writes the values
  on its charts; Activity opens the latest day with windows and suggests sorting the programs when
  most of the time is "Other".
- **Save a login from the bar, locked or signed out** — the extension's bar that offers to save a
  password typed into a page now has "Enter the master password" (or "Sign in"): the popup opens
  at that step, and once the vault is unlocked the bar comes back with "Save".
- **Bank balances** — every import also asks the bank what is on each imported account (what can
  be spent now, else what is booked): shown on the Bank card, above the month on the Finance page
  and to the AI (`finance_bank_balances`).
- **A statement of PKO BP** — Finance → "Import a PKO statement" (also on the Bank card): the
  history exported from iPKO (History → Download, CSV in Windows-1250 or XML) becomes
  transactions the same way as the bank's own import — matched with the ones typed by hand,
  transfers between one's own accounts left out, the category by the counterparty or the AI,
  and nothing doubled when a file (or a longer one over the same days) is imported again.
  Free, without any open-banking provider.
- **The bank directly (open banking)** — Settings → Integrations → Bank: PKO BP and other
  European banks through Enable Banking. The owner adds an application of their own (its id and
  .pem key, checked with Enable Banking); each user signs in on the bank's own page, chooses the
  accounts, and the booked operations come in every six hours as transactions: a transaction
  already typed by hand (the same amount a day apart at most) is tied to the operation instead
  of doubled, transfers between one's own accounts are left out, the category follows the
  counterparty (a corrected one is the rule next time) or the AI picks one of your own. The
  consent lasts up to 180 days; a reminder comes a week before it ends. The automations hear
  only of the recent operations, not of the history of a first import.
- **Life → Links: every section** — Health joins with every medication and condition as a date
  for "before and after" and with daily numbers (medications taken, visits, every lab analyte);
  the dated events of Psychology are dates too; new daily numbers: the time in the browser and
  on the sites most often open, the hours of Steam, the minutes the monitored sites were down,
  the screenshots, the tasks that came up and the messages to the assistant. Psychology still
  lays only the treatment of the mind over the mood.
- **Life → Links: before and after** — at the start or the end of a period Health tells (a
  mental-health diagnosis, a medication of a psychiatrist or a psychotherapist), every daily
  number of the weeks before against the weeks after (2, 4 or 8), with a mini chart around the
  date. A change is marked when it lies beyond the changes at the ordinary dates of the same
  history (a placebo test: the seasons and the trends are in it), corrected for the number of
  numbers. The assistant gets `core_before_after`, unless Health is hidden from its AI.
- **Life → Links** — the links engine: every daily number of every section against every other,
  of the same day and of the next one, with the seasons taken away (each day against the weeks
  around it) and the chance of an accident corrected for the days' own trends and for the
  number of pairs; the weather is not compared with the weather, and a link to the next day
  counts only beyond that day's own yesterday; "comes before" when a number tells about tomorrow
  beyond tomorrow's own yesterday; what predicts a chosen number with the others held fixed (a
  regression). Shown as the strongest links in words, a graph, a matrix of every pair and one
  pair day by day; the assistant gets `core_correlations`. New daily numbers for it and for
  "what goes with good days": every habit, GAD-7 / PHQ-9 / WHO-5 over the two weeks they ask
  about, games late at night, spending by category, commits, words in the diary, Dota 2 matches
  (played, late at night, won).
- **The extension as Grammarly** — the badge appears in a field as soon as it has the focus,
  shows that the text is being checked, and opens the panel of the field: the mistakes in a
  list, **Fix all**, the AI's rewrites, **Not on this site**. The popup opens on the check of
  the page in front (on or off for its site), the vault and the tools: the master password is
  asked only when a login is wanted. Logins and search boxes are no longer checked.
- **Server keys in Settings → Integrations** — the Telegram bot's token, the Spotify app's
  Client ID and Secret and the LanguageTool server's address are set by the owner in their
  cards instead of `.env`: checked with the service before they are kept, applied at once
  (the bot restarts by itself), stored encrypted and synced to a local copy.
- **Health** — one medical history of your own across countries and clinics: visits with
  their complaints, examination and recommendations, diagnoses by ICD code gathered into
  conditions with their history, medications (by the active substance too) and the documents
  — scans, photos, PDFs. Stored encrypted. The ICD-10 dictionary is downloaded from WHO by your
  own server after you accept WHO's terms (Settings → Integrations); it is never shipped or
  exported. A dictionary in Russian, Ukrainian or any language is loaded from a CSV or XLSX
  file of your own.
- **Health: lab results and studies** — a lab report as the laboratory gave it (its units and
  its own reference ranges); about 60 common analytes recognised by their names in Ukrainian,
  Russian, Polish or English, so one analyte from labs in different countries is one chart in
  one unit, with the laboratory's range as a band and what was out of it marked. Studies
  (ultrasound, MRI, ECG…) with their conclusions.
- **Health: a document read by the AI** — a photo or a PDF of a consultation, lab results or a
  study becomes a draft in its own language: the visit with its clinic, doctor, diagnoses and
  medications, the lab report line by line, or the study. Nothing is saved until you check the
  draft beside the original and press Save. From Telegram too: a photo with “🩺 A medical
  document”. The AI is Health's own connection when it has one. A document photographed page
  by page is one document: several photos at once, pages added later, or an album in Telegram —
  the AI reads every page together.
- **Health: a summary for a new doctor** — current diagnoses, medications, the latest results
  with their trend, studies and visits, under headings in Polish, Ukrainian, Russian, English
  or German, the texts translated by the AI if you ask; a speciality can be left out with
  everything of it. Opened to print or save as PDF, downloaded for Word, or shared as a link
  the doctor opens without an account for 1–30 days — revocable, with how often it was
  opened.
- **Health and the other sections** — Psychology shows the mood during the treatment of the
  mind (medications of a psychiatrist or psychotherapist, F-diagnoses); a line of a doctor's
  recommendations becomes a task in one click; the next visits in the morning digest (when
  ticked); Health in the command palette; demo data.
- **Health: the profile and medication reminders** — blood type, allergies, vaccinations with
  the next dose and operations, first in the summary for a doctor; a reminder to take a
  medication at its times, with “Taken” and “Skip” in Telegram and on the page, and how the
  taking went over two weeks; vaccinations due in the digest.
- **An AI connection of its own for a section** (Settings → AI): a local model for Health, say;
  the section's data then never reaches the shared connection.
- **Columns stored encrypted** for modules (`encryptedText()`, `encryptedBytes()`): a dump or a
  backup holds only ciphertext; the export of one's data writes them decrypted.
- **Psychology** — a section for watching oneself over time: the patterns of the mood, short
  questionnaires with their history (WHO-5, GAD-7, PHQ-9; self-observation, not a diagnosis)
  and the events of a life — told by their dates or by the age they happened at — saved as an
  Excel workbook or a Word document.
- **Evening check-in in Telegram**: the diary's evening reminder now has mood buttons, and the
  next message goes to the entry of that day.
- **State of the connections** in Settings → Integrations: every connected service with its
  last refresh, the error of a failed one, a token that expires soon (GitHub, GitLab); a
  message once a day when a connection gets into trouble. The assistant can read it too.
- **Demo mode** (`DEMO_MODE=true`): a "Try the demo" button on the login page opens a shared
  account with made-up data in every section, made anew every night. The demo user cannot
  change the account, connect services or upload files, and no background job reaches outside.
- **Passwords** — a password vault like 1Password: logins and secure notes encrypted on the
  device with a key of the master password (PBKDF2-SHA256, AES-256-GCM); the server and the AI
  see only ciphertext. A recovery key shown once opens it when the master password is
  forgotten; the vault locks itself after 10 minutes; a password generator and a strength meter.
  Changing the master password asks for the account password too.
- **Passwords in Chrome** — a browser extension (`apps/extension`, installed by hand): fills
  the logins of the page (Ctrl+Shift+L, or from the popup; a login of another site only after a
  phishing warning), offers to save or update a login typed into a page, makes passwords and
  puts them into the fields for a new one. The vault is opened in the extension with the master
  password; the server still sees only ciphertext.
- **The side menu in groups** — Things to do, Me, Work, Leisure, Security; a group folds (kept
  in the browser) and stays open while one of its pages is. Weather left the menu (its widget
  opens it), Projects moved into Work.
- **A hidden section stays quiet** — out of the morning digest and the notifications too, not
  only out of the menu.
- **Telegram:** `/spent 12 coffee` (or `/spent 12 EUR taxi`) records an expense of today in a
  category you have; a question of the assistant to confirm a deletion comes with Yes / No
  buttons.
- **Habits to build** — every day or a few days a week (sport, reading, a walk): a day counts
  when it is marked done; achievements of their own; the runs in the morning digest when they
  pass a milestone.
- **Psychology: a questionnaire on a schedule** — WHO-5, GAD-7 or PHQ-9 every 7, 14 or 30 days,
  a reminder in Telegram with the link.
- **Health: the ICE card** — emergency contacts in the profile; the card printed for the wallet
  or as a picture for the lock screen with a QR code.
- **A review of the week** — the Sunday summary looks at every section, asks 2–3 questions, and
  the answers go to the diary.
- **Life:** the weather of a day in the feed.
- **Habits** — a section for what you quit or cut down: alcohol, smoking or a habit of your
  own. "I quit drinking" starts the count; every day after is clean unless marked — on the
  page (a calendar of 12 weeks, "It happened today"), by an evening question in Telegram ("A day
  without alcohol?" — "Yes" / "It happened", then how much) or by telling the assistant. The
  goal is not at all, or at most N days a week; a day can carry an amount. Achievements from
  the first day to a thousand days, for alcohol and smoking each; a slip starts the run again
  and takes nothing away. Names are stored encrypted. Migration 0077.
- **Health: a diagnosis is taken off** — a condition gets "Take off the diagnosis": recovered
  (a new status), ruled out or in remission, kept in its history. "Ruled out" now means the
  diagnosis did not hold (it read "Снят" in Russian before; that is the new "recovered").
- **More achievements (400+)** — in Health only care counts: medications taken on schedule day
  after day, a diagnosis taken off; Psychology: a questionnaire month after month, the events of
  a life; Finance: months within the budgets, months in the black, savings goals reached,
  receipts read from photos; Life: goals of the year reached, a day many sections tell about;
  the assistant, automations that ran, two-factor sign-in, fixed security findings, the
  password vault and a month of uptime.
- **Passwords in the fields of a page** — a key icon in login fields with a menu of the site's
  logins; in a sign-up, a strong password (filled into both fields and saved to the vault at
  once) and the emails and logins you use most. The vault unlocks from the menu too.
- **Settings → Apps** — the desktop app, the browser extension and (later) the mobile one in one
  place: installers from your own server (Windows, Linux; macOS from GitHub Releases), the zip
  of the extension, and every computer and browser that runs an app with its version — an old
  one shows that an update has not come. The extension updates itself like the desktop app: the
  app keeps its folder at the server's version and the extension reloads with the new files.
- **The diary and the notes about people are stored encrypted** — the text of an entry, the
  template, the photos and their captions, the note about a person; a dump or a backup holds
  only ciphertext. What was written before is encrypted once, on the first start. The tags and
  the emoji marks of the diary stay plain (the filters read them); the search of the diary
  reads the entries and searches them in the app.
- **Pictures are made small before they are stored** — diary photos, receipts and photographed
  medical documents are turned upright, shrunk to 2560 px on the longest side and kept as WebP:
  a phone photo of several megabytes becomes a few hundred kilobytes. The place a photo was
  taken and the phone are dropped from it. PDFs and animations stay as they are.
- **Copies on this computer** — the desktop app saves the archive of "Export everything" once a
  day into a folder of the computer (Settings → Data), the last 14 kept: the data outlives the
  server and comes back through "Import archive".

- **Claude and other AI clients (MCP)** — the dashboard is an MCP server (`/api/mcp`): Claude
  Desktop, Claude Code and Cursor use the assistant's tools with an access token (read only, or
  read and change; Settings → Integrations, or the extension's popup). A deletion is confirmed
  by calling it again; changes are in the AI's action log; sections switched off for the AI,
  and those on a connection of their own, stay hidden. See docs/mcp.md.
- **Devices add tools of their own** — while online, the browser extension offers the page in
  front (its text only if allowed), the open tabs and opening a link; the desktop app, the
  window in front and the latest screenshots — to MCP clients and to the dashboard's assistant.
- **The assistant beside the page** — the extension's side panel (Alt+Shift+A): the same
  conversation as in the dashboard and Telegram, with buttons to sum up the page, save it to
  tasks, or explain the selection.
- **Writing** — spelling, grammar and punctuation in Russian, Ukrainian, English and Polish,
  checked by LanguageTool on your own server (the texts never leave it), each line in its own
  language; a dictionary, rules switched off, and rewrites by the AI (fix everything, shorter,
  polite, formal, friendly). A page to check a text, and the same marks everywhere one writes.
- **Browser extension: Writing in every field** — the mistakes underlined in textareas, inputs
  and rich editors (Gmail, GitHub, Jira), a card of fixes under the caret, the AI's rewrites from
  the badge of the field; a fix is typed in as the person would, so Ctrl+Z undoes it.
- **Desktop: Writing in every program** — the field one types in, in any program, is read
  through Windows UI Automation and its mistakes are underlined over it; the card of a mistake
  never takes the focus from the program. Programs that give no positions of their words (some
  Qt apps) get no marks; browsers are left to the extension.
- **Screenshots** — Ctrl+Alt+S in the desktop app opens an editor on the chosen piece of the
  screen: arrows, boxes, ovals, a marker, text, numbered marks, pixelation. Saved into
  Pictures\Personal Dashboard (a folder a month) and the clipboard, and kept the same as the
  server and every other computer: delete one anywhere and it goes everywhere; a file changed
  on two computers is kept twice, and a folder that lost most of its files never empties the
  server.
- **Music: share a song** — every song (playing now, the recent ones, the top) opens in
  YouTube Music or Spotify, its link there is copied, or it is sent through the system's share
  sheet. The links go straight to the song: found on YouTube Music by its own search, on
  Spotify through its API (with `SPOTIFY_CLIENT_ID` and `SPOTIFY_CLIENT_SECRET` set); a song
  not found gets a link to the search.
- **Notifications through an outbox** — every notification is written down first: the same one
  within its window goes out once (a price that jumps back and forth is told once in 12 hours),
  and a Telegram message that failed (a 429, the network) is tried again with a backoff —
  a minute, five, half an hour, two hours, six. Settings → Integrations shows what became of
  the latest ones.
- **Telegram: long messages are split** — an answer of the assistant, a digest or a monthly
  story over 4096 characters goes as several messages instead of being cut.
- **AI: what it costs** — the tokens of every request are counted per connection, model and
  day (the cached part too). With the prices of a million tokens the AI settings show the spend
  of today and of the month, and a monthly limit stops the chat once it is spent; background
  work (summaries, reading documents) goes on with a local model (Ollama) when there is one.
- **AI: the prompt cache works** — the time is the last line of the system prompt, so the
  tools and the rules are read from the provider's cache (cheaper and faster).
- **Browser extension: time by site** — the time on each site (only the site, never the page;
  never private windows) in Activity, for the assistant too ("how long was I on YouTube this
  week").
- **Browser extension: focus mode and limits of sites** — while a focus session of the desktop
  app runs, the distracting sites are closed; a site with a daily limit closes once its time is
  spent. "Open anyway" lets it in for 5 minutes. Set in Activity → Settings → Browser.

- **End-to-end smoke tests** (Playwright, `e2e/`): the built image is clicked through in a
  browser in CI — signing in, a diary entry, a transaction, a message to the AI (a fake model).
  The image is published only after they pass.
- **Renovate** (`renovate.json`): dependency updates as pull requests on Monday mornings, grouped
  (Angular, Nx, NestJS, Electron, minor and patch); security fixes at once.
- `RATE_LIMITS=false` turns the limits off — for the tests, or behind a proxy that limits.
- The send button of the AI chat has a name for screen readers.

### Fixed

- **A login from the menu under a field** — the browser extension fills the form of the field the
  menu was opened for: on a page with several forms (a sign-in in the header and in a dialog,
  beside a sign-up) the first form of the page was filled, and the field clicked stayed empty.
- **Writing in Telegram Desktop** — the desktop app underlines the mistakes in its input and
  types the fixes there too: Qt programs give the focus to a viewport inside the field, which was
  taken for no field at all.
- **Bank categories** — a card payment, which the bank sends without a name, takes its shop from
  the title, so its category follows the shop's other payments and the AI sorts it; the AI is
  asked about every new shop of an import (not only the first 60); "Sort the uncategorized" on
  the Bank card sorts the ones already imported.
- **Background jobs send nothing twice.** A failed run was retried at once, twice, and a run
  over 15 minutes was taken as hung and started again — reminders and payments repeated. Jobs
  are no longer retried (a sync that sends nothing may be, with a backoff), may run an hour (the
  wishlist three), and a job over the users goes on past one user's error and reports it after.
- **Calls to outside services give up after 30 seconds** (GitHub, GitLab, Bitbucket, WakaTime,
  Steam, Battle.net, OpenDota, Last.fm, Spotify, Hetzner, DeepSeek, npm, files from Telegram).
- **`/api/health` checks the database and the background jobs**, and answers 503 when either is
  down, so Docker sees a broken container.
- **The trash keeps only what a person deleted**: the daily cleanup of old activity measurements
  no longer fills it.
- **The Docker image is published only after CI passes** on the commit.
- **Limits on what costs:** an AI message (30 a minute), an attachment, reading a medical
  document by the AI, an import, a new account (5 an hour from one address) and the demo; over
  the limit the answer is 429 with how long to wait.
- **Signing in:** the API key of an AI connection or a cookie is never carried over a redirect to
  another host; the current password in "change password" is limited like a sign-in; a lock
  is never forgotten however many other addresses try.
- **Desktop:** its queue is written whole or not at all (a crash leaves no broken file) and
  together a moment later; the device is kept in a file of its own; a batch the server refuses
  is split or dropped instead of blocking the queue; an upload gives up after 30 seconds; no
  PowerShell no longer crashes the app, and the window watcher never runs twice.
- **Smaller:** a rule of Activity takes only the user's own project; every write names the
  user, not only the row; monitors are checked ten at a time and one failed check never loses
  the others; a wishlist page is read only up to its limit.

### Updating

- Migration 0062 adds `integration_alerts`, 0063–0065 the tables of Psychology, 0066
  `ai_settings.module_connections`, 0067 the tables of Health, 0068 its lab results and studies, 0069 the
  drafts of its documents, 0070 the links for doctors, 0071 the profile
  and the reminders to take medications, 0072 the pages of its documents, 0073 the missing
  indexes (`user_id` and foreign keys of a few dozen tables), 0074 the word count of a diary
  entry, 0075 the password vault, 0076 the devices of Settings → Apps, 0077 the habits, 0078 the habits to build, 0079
  the questionnaire reminders, 0080 the emergency contacts, 0081 the notification outbox, 0082
  the AI's tokens and the prices of its connections, 0083 the time by site and the focus
  session of a device, 0084 the settings of Writing, 0085 the screenshots, 0086 the access tokens of MCP clients.
- `deploy/compose.yml` gets a `languagetool` service; for `npm run dev` start it with
  `docker compose up -d languagetool`.
- `TELEGRAM_BOT_TOKEN`, `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET` and `LANGUAGETOOL_URL`
  are no longer read: after updating, the owner enters them once in Settings → Integrations
  (LanguageTool from docker compose: `http://languagetool:8010`), then removes them from `.env`.
- The browser extension and the desktop app need their new versions for the time by site and
  the focus mode; both update by themselves.
- Encrypted columns use `ENCRYPTION_KEY`: a local copy that syncs with the server needs the same
  key as the server.

## 0.3.0 — the first public release

### Added

- **Links between the sections.** What one section knows is shown where another needs it, with
  the modules still independent (the core joins them):
  - a project across the sections — time at the computer, coding time, money, tasks, uptime,
    commits and releases, money per hour of work, month by month;
  - time of a computer without the tracker (WakaTime) and of games on other devices (Steam) in
    the time at the computer, without counting anything twice;
  - what goes with a good and a bad day: the numbers of every section, the weather and the
    daily rhythm against the mood of the diary;
  - the last commit before a site went down, and whether your own computers lost the server at
    the same time;
  - subscriptions against their use; a wish against its savings goal and the month's budget;
    gift ideas of the wishlist in Birthdays, and a task to buy a gift a week before;
  - the music of focus sessions; the time of a task from focus sessions and window titles;
    a limit of games that grows with the tasks done.
- **Security agent** — watches sign-ins, the server, your computers and repositories every
  hour; an AI investigates in the morning and writes a guide for each finding.
- **Export and import** of everything you keep, as a ZIP with readable files.
- **Wishlist** with prices read from the shops' pages every day.
- **Days of memory** next to birthdays.
- **Repositories** of GitHub, GitLab and Bitbucket in one tab, private ones too.
- The assistant: a tool for every link, links to the pages of the app in its answers, search in
  your own history.
- More than 360 achievements, some for what the sections know together.

### Security

- The server refuses to start with the placeholder secrets of `.env.example`.
- Requests to addresses users give (a monitored site, a shop's page, an AI endpoint) do not go
  to private and local addresses once registration is open (`ALLOW_PRIVATE_URLS`).
- PostgreSQL of the local `docker-compose.yml` listens on this computer only.
- The assistant asks before it replaces text in the diary, as it does before deleting.

### Updating

- With `ALLOW_REGISTRATION=true`, monitors and AI connections that point to a private address
  (a NAS at `192.168.*`, Ollama on `localhost`) stop working until `ALLOW_PRIVATE_URLS=true` is
  set. A personal instance (registration closed) is not affected.
- A database of the local `docker-compose.yml` reached from another computer of your network
  needs its port published again by hand.

## 0.2.1 and earlier

Before the repository was public; see the
[releases](https://github.com/romanrostislavovich/personal-dashboard/releases).

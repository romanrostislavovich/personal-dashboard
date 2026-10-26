# What the dashboard collects

One list of every signal the dashboard has about its owner's days — the ground Links v2
([proposals/links-v2.md](proposals/links-v2.md)) builds on. **Keep it up to date:** a new
collector, a new daily number or a change of what is kept is written here in the same change.

Status 2026-10-26. Checked against the code: every `*.schema.ts`, every `register*` call of
`LinksService`, every scheduled job and the collectors of the phone, the desktop app and the
extension.

**Marks:** 🧪 — built and deployed, never seen on real data yet (expect fixes on the first real
run); ⚠️ — known to be partial (see its note). A row without a mark is in use.

Contents:

1. [How a signal reaches Links](#how-a-signal-reaches-links)
2. [Every daily number Links has](#every-daily-number-links-has) — the catalogue
3. [The phone](#the-phone-the-android-app) · [The computer](#the-computer-the-desktop-app) ·
   [The browser](#the-browser-the-chrome-extension) · [The band](#the-band-google-health-api) ·
   [Outside services](#outside-services) · [Typed in](#typed-in-by-the-user) ·
   [The dashboard itself](#the-dashboard-itself)
4. [Moments, periods, projects, people](#moments-periods-projects-people)
5. [Kept but not in Links yet](#kept-but-not-in-links-yet) — the raw material of v2
6. [How long things are kept](#how-long-things-are-kept)

## How a signal reaches Links

A section never reads another one; it registers sources with the core `LinksService`
(`libs/api/core/src/lib/links/links.service.ts`) in its `<module>.links.ts`:

| Source kind                          | What it gives                                                                           | Used by                                                      |
| ------------------------------------ | --------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| `registerDailyMetrics`               | a number per day (`DailyMetric`: `key`, `unit`, `days[]`, optional `partOf`, `missing`) | correlations, good/bad mood days, before/after, the forecast |
| `registerMoments`                    | events with a start (and an end) between two moments                                    | before/after, "what happened then"                           |
| `registerPeriods`                    | things that lasted: a medication, a condition, a life event                             | the timeline, before/after                                   |
| `registerProject`                    | facts and changes of one project                                                        | Projects → overview                                          |
| `registerUsage`                      | whether something paid for is used                                                      | Finance → subscriptions                                      |
| `registerTimeSpent`                  | seconds spent on a name (`windows` by title, `focus` by the session note)               | tasks, projects                                              |
| `registerPeople`                     | what a section keeps about a person by name                                             | birthdays, the assistant                                     |
| `LifeService.register` (`*.life.ts`) | the day's events and the month's cards                                                  | Life, the daily chronicle, the month story                   |

**Units** (`DailyMetric.unit`): `hours`, `count`, `money` (+ `currency`), `score` (a reading
with no fixed scale), `degrees`, `percent` (0–100), `clock` (a time of day in hours; over 24 —
after midnight, e.g. 25.5 = 01:30).

**Missing days.** `missing: 'absent'` — a day the collector did not report is _unknown_, never a
zero (the phone, the band, telemetry). Without it a day with nothing is a zero where the section
says so (no Dota matches = no matches). `partOf` — a part of another number (spending on food of
all spending; late games of games): the two are never compared with each other.

**Day boundaries.** Days are the user's time zone (`users.time_zone`). A few numbers move the
night to the evening before: Dota matches and phone night use count 00:00–04:00 to the day
before; `activity.lateGames` is from 23:00.

## Every daily number Links has

Fixed keys plus families (`<category>`, `<site>`, `<habit id>`, `<analyte>`, `<name>`).
"Absent" = `missing: 'absent'`.

| Key                                     | Unit                                | From                                                     | Absent | Part of             |
| --------------------------------------- | ----------------------------------- | -------------------------------------------------------- | ------ | ------------------- |
| `activity.hours`                        | hours                               | spans of every device (computers and the phone)          |        |                     |
| `activity.games`                        | hours                               | spans in the `games` category                            |        |                     |
| `activity.lateGames`                    | hours                               | games from 23:00                                         |        | `activity.games`    |
| `activity.focus`                        | hours                               | focus sessions                                           |        |                     |
| `activity.firstUse`, `activity.lastUse` | clock                               | first and last span of the day (every device)            |        |                     |
| `activity.browser`                      | hours                               | site visits                                              |        |                     |
| `activity.site.<site>`                  | hours                               | the six sites seen on the most days (10+ days)           |        | `activity.browser`  |
| `activity.telemetry.desktop.<name>`     | see [telemetry](#desktop-telemetry) | desktop telemetry buckets                                | yes    |                     |
| `activity.telemetry.browser.<name>`     | same                                | browser telemetry buckets                                | yes    |                     |
| `activity.phone.unlocks`                | count                               | unlocks                                                  | yes    |                     |
| `activity.phone.night`                  | hours                               | phone apps 23:00–04:00                                   | yes    |                     |
| `activity.phone.firstUse`, `…lastUse`   | clock                               | first unlock / screen-on after 04:00, last use before it | yes    |                     |
| `activity.phone.rest`                   | hours                               | longest screen-off stretch 20:00–12:00 (sleep proxy)     | yes    |                     |
| `activity.phone.steps`                  | count                               | the phone's step counter                                 | yes    |                     |
| `activity.phone.headphones`, `…car`     | hours                               | Bluetooth connections by device kind                     | yes    |                     |
| `activity.phone.media`                  | hours                               | something playing                                        | yes    |                     |
| `activity.phone.dnd`                    | hours                               | Do Not Disturb on                                        | yes    |                     |
| `activity.phone.calls`                  | count                               | calls                                                    | yes    |                     |
| `activity.phone.callMinutes`            | count                               | call minutes                                             | yes    |                     |
| `activity.phone.people`                 | count                               | different people called or calling                       | yes    |                     |
| `activity.phone.photos`                 | count                               | photos taken                                             | yes    |                     |
| `activity.phone.mobileData`             | count (MB)                          | mobile data of all apps                                  | yes    |                     |
| `activity.phone.noise`                  | score (dB, uncalibrated)            | the day's average noise                                  | yes    |                     |
| `activity.phone.daylight`               | hours                               | light over 1 000 lux                                     | yes    |                     |
| `activity.places.km`                    | count (km)                          | the day's path                                           | yes    |                     |
| `activity.places.count`                 | count                               | stays (places one stopped at)                            | yes    |                     |
| `activity.places.walk`                  | hours                               | moving on foot                                           | yes    |                     |
| `activity.places.onTheWay`              | hours                               | all trips                                                | yes    |                     |
| `activity.places.home`                  | hours                               | at home (the place of most nights)                       | yes    |                     |
| `activity.places.newPlaces`             | count                               | places never seen before                                 | yes    |                     |
| 🧪 `health.band.sleep`                  | hours                               | the band: the main sleep that ended that day             | yes    |                     |
| 🧪 `health.band.deepSleep`, `…remSleep` | hours                               | its stages                                               | yes    |                     |
| 🧪 `health.band.bedtime`, `…wake`       | clock                               | fell asleep (before noon → +24), woke up                 | yes    |                     |
| 🧪 `health.band.restingHeartRate`       | count (bpm)                         | the band's daily resting heart rate                      | yes    |                     |
| 🧪 `health.band.hrv`                    | score (ms)                          | the band's daily HRV                                     | yes    |                     |
| 🧪 `health.band.spo2`                   | percent                             | the band's daily SpO2                                    | yes    |                     |
| 🧪 `health.band.steps`                  | count                               | the band's steps                                         | yes    |                     |
| 🧪 `health.band.calories`               | count (kcal)                        | total calories                                           | yes    |                     |
| 🧪 `health.band.zoneMinutes`            | count                               | active zone minutes (fat burn + cardio + peak)           | yes    |                     |
| `health.intakes`                        | percent                             | doses taken of those answered (taken or skipped)         |        |                     |
| `health.visits`                         | count                               | doctor visits                                            |        |                     |
| `health.lab.<analyte>\|<unit>`          | score                               | each lab value on the day it was taken                   |        |                     |
| `psychology.who5`, `.gad7`, `.phq9`     | score                               | questionnaires, held until the next answer               |        |                     |
| `diary.mood`                            | score (1–5)                         | the diary's mood                                         |        |                     |
| `diary.words`                           | count                               | words written                                            |        |                     |
| `habits.<habit id>`                     | count                               | marked days (0 on a clean day)                           |        |                     |
| `tasks.done`, `tasks.created`           | count                               | tasks                                                    |        |                     |
| `development.coding`                    | hours                               | WakaTime                                                 |        |                     |
| `development.commits`                   | count                               | GitHub + GitLab + Bitbucket                              |        |                     |
| `music.plays`                           | count                               | Last.fm plays                                            |        |                     |
| `games.steam`                           | hours                               | Steam playtime per day                                   |        |                     |
| `games.dotaMatches`                     | count                               | Dota matches (00–04 → the evening before)                |        |                     |
| `games.dotaLateMatches`                 | count                               | matches from 23:00                                       |        | `games.dotaMatches` |
| `games.dotaWins`                        | percent                             | matches won of those with a known result                 |        |                     |
| `finance.spent`                         | money                               | expenses                                                 |        |                     |
| `finance.spent.<category>`              | money                               | expenses of a category                                   |        | `finance.spent`     |
| `weather.temperature`                   | degrees                             | Open-Meteo, the past days where the user is              |        |                     |
| `weather.rain`                          | count (mm)                          | same                                                     |        |                     |
| `weather.sun`                           | hours                               | same                                                     |        |                     |
| `monitoring.downMinutes`                | count                               | minutes the user's sites were down                       |        |                     |
| `screenshots.taken`                     | count                               | screenshots                                              |        |                     |
| `ai.messages`                           | count                               | messages to the assistant                                |        |                     |

## The phone (the Android app)

`apps/mobile` (Capacitor + Java collectors in `android/.../sensors`), switched on in Settings →
Devices. Every collector has its own permission and switch. The phone keeps a queue
(`SensorsStore`) and sends it every 15 minutes (`SensorsWorker`, WorkManager); the places service
sends its fixes every 5 minutes while it runs. Server: `libs/modules/activity/api/src/lib/phone`,
`places`, `phone-notifications.*`. Shown on Activity → Phone and Activity → Places.

The owner's phone is a Redmi 9 (`galahad`, Android 10): no barometer.

| What                                                                                                         | Grain                                                                                            | Where                                                                     | To Links                                                               | Notes                                                                                                                |
| ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------- | ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Time in each app: package, app name, start, end                                                              | a span per switch (UsageStats), sent every 15 min                                                | `activity_spans` (device platform `android`, title empty)                 | `activity.phone.night`; part of `activity.hours`                       | Usage access; common apps have categories (`KNOWN_APPS`)                                                             |
| Unlocks                                                                                                      | each moment                                                                                      | `activity_phone_unlocks`                                                  | `activity.phone.unlocks`; unlocks by hour on the page                  | `KEYGUARD_HIDDEN`, Android 9+                                                                                        |
| Notifications of other apps: app, app name, title, text, posted at                                           | each one                                                                                         | `activity_phone_notifications`                                            | — (counts per app on the page)                                         | Notification access; title and text encrypted                                                                        |
| Location fixes: latitude, longitude, accuracy                                                                | every minute still (Wi-Fi/cells); every 5 s on the move (GPS); the motion sensor starts the move | `activity_phone_locations` (the point encrypted)                          | `activity.places.*` (via stays and trips)                              | "Allow all the time"; a quiet notification while it records. ⚠️ GPS mode on a walk not checked yet                   |
| Stays, trips and how one moved (on foot / bike / riding)                                                     | derived per day from the fixes                                                                   | computed (`places.service.ts`)                                            | `activity.places.km`, `count`, `walk`, `onTheWay`, `home`, `newPlaces` | a day counts with ≥ `MIN_DAY_POINTS` fixes; home = the place of most nights (3 am)                                   |
| Names of places: name, kind, source                                                                          | once per new place                                                                               | `activity_place_names` (encrypted)                                        | —                                                                      | OpenStreetMap in the background; Google Places on demand with the user's own key; Google timeline names on import    |
| The user's named places; where one is now                                                                    | on change                                                                                        | `activity_places`, `activity_place_presence`                              | —                                                                      | for the automations "came to / left a place"                                                                         |
| Google Maps timeline (import of a Takeout file)                                                              | once, on import; visits become a fix every 5 min, paths as they are                              | `activity_phone_locations` under its own device "Google Maps"             | `activity.places.*` for the imported years                             | parsed in the browser (`google-timeline.ts`), sent in batches                                                        |
| **1.** Screen on / off                                                                                       | each change                                                                                      | `activity_phone_signals` (`screenOn`, `screenOff`, no data)               | `activity.phone.firstUse`, `lastUse` (clock), `rest` (hours)           | the sleep proxy until the band                                                                                       |
| **1.** Charging: on / off, battery %                                                                         | each change                                                                                      | `activity_phone_signals` (`charging`: `on`, `level`)                      | —                                                                      |                                                                                                                      |
| **2.** Steps of the phone's step counter                                                                     | every 15 min, summed per day                                                                     | `activity_phone_daily` (`steps`)                                          | `activity.phone.steps`                                                 | "Physical activity" permission                                                                                       |
| **3.** Wi-Fi joined / left: the network's name                                                               | each change                                                                                      | `activity_phone_signals` (`wifi`: `ssid` or null)                         | —                                                                      | encrypted; the name needs the location permission                                                                    |
| **3.** Bluetooth connected / disconnected: device name, kind (car / headphones / speaker / wearable / other) | each change                                                                                      | `activity_phone_signals` (`bluetooth`: `connected`, `name`, `kind`)       | `activity.phone.headphones`, `car` (hours)                             | encrypted. ⚠️ not checked on real data yet                                                                           |
| **4.** What plays: app, title, artist, playing / paused                                                      | each change                                                                                      | `activity_phone_signals` (`media`)                                        | `activity.phone.media` (hours)                                         | through Notification access; no audio                                                                                |
| **5.** Do Not Disturb on / off; the ringer mode (normal / vibrate / silent)                                  | each change                                                                                      | `activity_phone_signals` (`dnd`: `on`; `ringer`: `mode`)                  | `activity.phone.dnd` (hours)                                           | through Notification access                                                                                          |
| **6.** Calls: when, seconds, in / out / missed / other, who as a hash                                        | read from the call log every 15 min                                                              | `activity_phone_signals` (`call`: `seconds`, `type`, `who`)               | `activity.phone.calls`, `callMinutes`, `people`                        | the number never leaves the phone: SHA-256 with the phone's own salt, 12 hex digits. ⚠️ not checked on real data yet |
| **7.** Photos taken: the moment, camera or another folder                                                    | read from the media store every 15 min                                                           | `activity_phone_signals` (`photo`: `camera`)                              | `activity.phone.photos`                                                | the picture stays on the phone; where — from the fixes; screenshots left out                                         |
| **8.** Mobile data per app today; Wi-Fi data in all                                                          | every 15 min, the day's total                                                                    | `activity_phone_daily` (`mobileBytes` with the app as `key`; `wifiBytes`) | `activity.phone.mobileData` (MB, all apps)                             | usage access                                                                                                         |
| **9.** Noise level: dB of 3 seconds                                                                          | every 15 min while the places service runs                                                       | `activity_phone_signals` (`noise`: `db`)                                  | `activity.phone.noise` (the day's average)                             | microphone permission; uncalibrated, for comparing days; no sound kept                                               |
| **10.** Light (lux); air pressure (hPa) if the phone has a barometer                                         | every 15 min while the places service runs                                                       | `activity_phone_signals` (`light`: `lux`; `pressure`: `hpa`)              | `activity.phone.daylight` (hours over 1 000 lux)                       | the Redmi 9 has no barometer: light only                                                                             |
| The phone itself: name, last seen                                                                            | each upload                                                                                      | `activity_devices` (platform `android`)                                   | —                                                                      | a device token per phone                                                                                             |
| The app's version                                                                                            | on start                                                                                         | `app_installs`                                                            | —                                                                      | Settings → Apps                                                                                                      |
| Push token                                                                                                   | on change                                                                                        | `push_devices`                                                            | —                                                                      | Firebase                                                                                                             |

The phone's card "The phone, an average day" (Activity → Phone) reads collectors 1–10. ⚠️ Not
checked on the phone yet: that card, the calls and Bluetooth collectors, GPS mode on a walk.

## The computer (the desktop app)

`apps/desktop` (Electron, Windows; PowerShell scripts in `src/assets`). Each computer is a device
(`activity_devices`, platform `windows`). Server: `libs/modules/activity/api`.

| What                                                                                                                                                                                                                                                                                                                                                           | Grain                                         | Where                                                 | To Links                                                                           | Notes                                                                                                                                                           |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- | ----------------------------------------------------- | ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The window in front: process, program name, title, start, end                                                                                                                                                                                                                                                                                                  | read every 5 s, spans sent every minute       | `activity_spans`                                      | `activity.hours`, `games`, `lateGames`, `firstUse`, `lastUse`; time spent by title | idle (no input for `idle_minutes`) is not counted; players and browsers count without input, 3 h at most; private windows and words left out; titles cut at 500 |
| A program's category and "not counted"                                                                                                                                                                                                                                                                                                                         | set by the user (defaults for known programs) | `activity_apps`                                       | (decides `activity.games`)                                                         | categories: development, browsing, communication, office, design, games, media, meetings, system, other                                                         |
| Rules "a window / site of project X"; suggested rules                                                                                                                                                                                                                                                                                                          | on change; suggestions daily 05:10            | `activity_project_rules`, `activity_rule_suggestions` | project time                                                                       |                                                                                                                                                                 |
| Focus sessions (Pomodoro): start, end, planned minutes, seconds of focus, finished or not, project, note, distractions (program, seconds)                                                                                                                                                                                                                      | each session                                  | `activity_focus_sessions`                             | `activity.focus`; time spent by the note                                           | started by the user; distractions are recorded, never interrupted                                                                                               |
| Daily limits (games, all, a program, a site) and when they were reached                                                                                                                                                                                                                                                                                        | on change / once a day                        | `activity_limits`                                     | —                                                                                  | checked on every upload                                                                                                                                         |
| The computer's state: CPU %, memory, disks (free/total), uptime                                                                                                                                                                                                                                                                                                | every 5 min                                   | `activity_health`                                     | —                                                                                  | kept 30 days                                                                                                                                                    |
| … and when Windows tells it: board temperature and throttling, CPU speed vs base, GPU load and name, battery (charge, on AC, design and full capacity), Wi-Fi (name, signal, rate), physical disks' health, OS and boot time, Defender, firewall, disk encryption, days since update, restart pending, locks when idle, UAC, top 10 programs by CPU and memory | same                                          | `activity_health.system`                              | —                                                                                  | warnings: low disk, heat, battery health, reboot; the protection part feeds the security agent                                                                  |
| Internet and server outages: kind, start, end                                                                                                                                                                                                                                                                                                                  | each outage                                   | `activity_outages`                                    | moments (`outage`)                                                                 | NCSI check                                                                                                                                                      |
| Work contexts: program, window title, project folder, git branch, open browser tabs (from the extension), note                                                                                                                                                                                                                                                 | on capture                                    | `activity_workstates`                                 | —                                                                                  | kept 30 days; texts pass the telemetry filter                                                                                                                   |
| Screenshots (Ctrl+Alt+S, the folder sync, "Copy")                                                                                                                                                                                                                                                                                                              | each                                          | `screenshots` (image, thumbnail, size, hash)          | `screenshots.taken`                                                                |                                                                                                                                                                 |
| Disk scan and cleanup                                                                                                                                                                                                                                                                                                                                          | on demand                                     | not kept (advice asked from the server)               | —                                                                                  |                                                                                                                                                                 |
| Bank statements dropped into Downloads                                                                                                                                                                                                                                                                                                                         | on a new file                                 | → `finance_transactions` after the user's OK          | (in spending)                                                                      |                                                                                                                                                                 |
| Writing fixes accepted                                                                                                                                                                                                                                                                                                                                         | each                                          | `writing_settings.fixes_accepted` (a counter)         | —                                                                                  | LanguageTool                                                                                                                                                    |
| Copies of the data on the computer                                                                                                                                                                                                                                                                                                                             | daily                                         | files on the computer                                 | —                                                                                  |                                                                                                                                                                 |
| The app's version                                                                                                                                                                                                                                                                                                                                              | on start                                      | `app_installs`                                        | —                                                                                  |                                                                                                                                                                 |

### Desktop telemetry

Opt-in, off by default ([apps/desktop/TELEMETRY.md](../apps/desktop/TELEMETRY.md)); same consent
in the extension. Buckets of up to 5 minutes in `telemetry_dynamics`
(`source` desktop or browser, `metrics` JSON), kept 30 days. No names, titles, text or keys leave
the process; the browser's page part passes `sanitizeTelemetryUrl`/`Text`.

| Field in a bucket                                                                                     | Measured by                              | To Links (`activity.telemetry.<source>.<name>`)                        |
| ----------------------------------------------------------------------------------------------------- | ---------------------------------------- | ---------------------------------------------------------------------- |
| `inputCount` — key presses (never the keys)                                                           | desktop (Visual Studio only)             | `inputCount` (count), `inputPerMinute` (score)                         |
| `backspaceCount`, `backspaceBursts`                                                                   | desktop (Visual Studio only)             | `backspacePercent` (percent of input)                                  |
| `pauseMeanMs`, `pauseVarianceMs2` — pauses in typing                                                  | desktop (Visual Studio only)             | —                                                                      |
| `contextSwitches`, `uniqueApps`, `focusEntropy`                                                       | desktop (`context-switch.ts`)            | `contextSwitches` (count)                                              |
| `focusSeconds` — time in one program without a switch                                                 | desktop                                  | `focusHours` (hours)                                                   |
| `terminalCommands`, `terminalFailures`                                                                | desktop (`terminal-friction.ts`)         | `terminalCommands`, `terminalFailures` (count), `terminalErrorPercent` |
| `buildWaitMs`                                                                                         | desktop                                  | `buildWaitHours` (hours)                                               |
| `readingSeconds`, `scrollDepthPercent`, `copyCount`                                                   | browser (the extension's content script) | `readingHours` (hours, browser)                                        |
| `page`: address without query, title, type (article, tech article, video, course, site), technologies | browser                                  | —                                                                      |

All of them are `missing: 'absent'`. The Life section also gets `…Day` events of the same names.

## The browser (the Chrome extension)

`apps/extension`. Signs in to the dashboard; private windows never seen.

| What                                                                                               | Grain                                        | Where                                   | To Links                                                           | Notes                                                                                                                  |
| -------------------------------------------------------------------------------------------------- | -------------------------------------------- | --------------------------------------- | ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| Time on each site (the active tab of the focused window, or a tab playing sound): site, start, end | a visit, sent every minute; idle after 2 min | `activity_site_visits`                  | `activity.browser`, `activity.site.<site>` (top six with 10+ days) | only the site, never the address or title; the answer closes distracting sites during focus and sites over their limit |
| Browser telemetry                                                                                  | one-minute buckets                           | `telemetry_dynamics` (`browser`)        | `activity.telemetry.browser.*`                                     | see [the table above](#desktop-telemetry)                                                                              |
| Open tabs for a work context                                                                       | on capture                                   | `activity_workstates`                   | —                                                                  |                                                                                                                        |
| Wishes ("To the wishlist"): the product page parsed — name, price, picture                         | on click                                     | `finance_wishes`                        | —                                                                  |                                                                                                                        |
| Writing fixes accepted                                                                             | each                                         | `writing_settings.fixes_accepted`       | —                                                                  |                                                                                                                        |
| Passwords                                                                                          | on save                                      | `vault_items` (encrypted on the client) | —                                                                  | the server cannot read them                                                                                            |

## The band (Google Health API)

🧪 **Built 2026-10-26, never run against the real API** (the band, a Fitbit Air, arrives from
2026-10-27; the owner's Redmi 9 cannot install the Google Health app — it needs Android 11+, so the
band will be paired with another phone; the dashboard reads the account from the server, the phone
does not matter). Server: `libs/modules/health/api/src/lib/wearable`; page Health → Band;
connection in Settings → Integrations → Google Health. Written from the documented API shapes;
expect fixes after the first real sync (the error shows in the card and in
`health_wearable_accounts.last_error`).

How: OAuth (read-only scopes `googlehealth.activity_and_fitness`, `health_metrics_and_measurements`,
`sleep`), refresh token in `user_secrets`. Job `health.wearable-sync` every hour at :07; the first
sync takes 56 days back, later ones re-read the last 3 days (the band syncs late), in 14-day
chunks. One row per day in `health_wearable_days`, a kind the account does not allow (403) is left
out, a day without a value is `null` (never 0).

| Field of `health_wearable_days`      | From the API                                       | To Links                                    |
| ------------------------------------ | -------------------------------------------------- | ------------------------------------------- |
| `sleep_minutes`                      | the longest sleep ending that day: `minutesAsleep` | `health.band.sleep` (hours)                 |
| `deep_minutes`, `rem_minutes`        | its stages                                         | `health.band.deepSleep`, `remSleep` (hours) |
| `light_minutes`                      | stage LIGHT (a CLASSIC sleep: ASLEEP + RESTLESS)   | —                                           |
| `awake_minutes`                      | stage AWAKE / `minutesAwake`                       | —                                           |
| `sleep_start`, `sleep_end` (`HH:MM`) | the sleep's civil start and end                    | `health.band.bedtime`, `wake` (clock)       |
| `resting_heart_rate`                 | `dailyRestingHeartRate`                            | `health.band.restingHeartRate`              |
| `hrv_ms`                             | `dailyHeartRateVariability` (average, ms)          | `health.band.hrv`                           |
| `spo2`                               | `dailyOxygenSaturation` (average %)                | `health.band.spo2`                          |
| `heart_rate_avg`, `heart_rate_max`   | the heart-rate daily roll-up                       | —                                           |
| `steps`                              | steps roll-up                                      | `health.band.steps`                         |
| `calories`                           | total calories roll-up                             | `health.band.calories`                      |
| `distance_km`                        | distance roll-up                                   | —                                           |
| `active_zone_minutes`                | fat burn + cardio + peak                           | `health.band.zoneMinutes`                   |

Not read yet: minute-level heart rate, the sleep's stage timeline, naps as their own entries,
exercises and the API's other data types. The stress index from HRV and resting heart rate is
still to come.

## Outside services

Settings → Integrations; the keys are the user's (`user_secrets`, encrypted) or the owner's server
keys. Each integration has its own health check (`integration_alerts`, daily 09:20).

| Service                                    | What                                                                                                                                                                                                                       | How often                        | Where                                                                                                     | To Links                                                                  |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| GitHub (profile)                           | contributions per day; per year commits, PRs, reviews, issues; followers, repos, stars, languages, top repos (each day's followers/repos/stars kept)                                                                       | hourly (:20)                     | `github_profiles`, `github_contribution_days`, `github_contribution_years`, `github_profile_daily_stats`  | (commits through `code_account_days`)                                     |
| GitHub, GitLab, Bitbucket (code accounts)  | per day: contributions, commits, PRs, reviews, issues; the profile                                                                                                                                                         | hourly (:40)                     | `code_accounts`, `code_account_days`                                                                      | `development.commits` (all accounts)                                      |
| Open Source (public repos of the accounts) | stars, forks, open issues, open PRs, npm weekly downloads, the latest release, last push — and each day's numbers                                                                                                          | hourly                           | `github_tracked_repos`, `github_repo_daily_stats`                                                         | project facts (stars)                                                     |
| WakaTime                                   | coding seconds per day; per day by project, language, editor, OS; spans of work (start, end) by project/language                                                                                                           | hourly (:40)                     | `wakatime_days`, `wakatime_day_breakdown`, `wakatime_spans`                                               | `development.coding`; project facts (coding time)                         |
| Last.fm                                    | every play: artist, track, album, time; the whole history imported once                                                                                                                                                    | every 15 min                     | `music_scrobbles`                                                                                         | `music.plays`; moments (`play`); usage of streaming services              |
| Spotify                                    | what plays now                                                                                                                                                                                                             | when the page is open            | not kept                                                                                                  | —                                                                         |
| SoundCloud                                 | the user's own tracks: plays, likes, reposts, comments, downloads; per day per track; followers per day                                                                                                                    | hourly (:25)                     | `music_soundcloud_*`                                                                                      | —                                                                         |
| Steam                                      | library (playtime, last played, achievements); playtime per game per day                                                                                                                                                   | twice an hour                    | `games_steam_games`, `games_steam_play_days`                                                              | `games.steam`; usage; Steam time counts as "another computer" in Activity |
| Dota 2 (Steam, OpenDota)                   | every match: hero, won, K/D/A, duration, mode, lobby, party, GPM, XPM, last hits, denies, hero/tower damage, healing, leaver                                                                                               | twice an hour                    | `games_dota_matches`                                                                                      | `games.dotaMatches`, `dotaLateMatches`, `dotaWins`                        |
| World of Warcraft (Battle.net)             | characters with gear, stats, talents, Mythic+, raids, PvP, collections, reputations, professions, guild; per day item level, Mythic+ rating, achievement points, mounts, pets, toys; achievements; WoW Token price per day | twice an hour                    | `games_accounts`, `games_wow_details`, `games_wow_days`, `games_wow_achievements`, `games_wow_token_days` | — . ⚠️ the details never ran against real Battle.net                      |
| Xbox (OpenXBL)                             | gamerscore, games, achievements, last played                                                                                                                                                                               | twice an hour                    | `games_accounts.profile`                                                                                  | — (Xbox gives no hours)                                                   |
| Open banking (Enable Banking)              | transactions (amount, currency, counterparty, booked on), balances                                                                                                                                                         | 4 times a day (every 6 h at :15) | `finance_bank_*`, `finance_transactions`                                                                  | `finance.spent`, `finance.spent.<category>`                               |
| Hetzner Cloud, DeepSeek                    | costs                                                                                                                                                                                                                      | daily 07:00                      | `finance_cost_sources`, `finance_transactions`                                                            | (in spending)                                                             |
| Shops (wishlist price watch)               | the price of each wish                                                                                                                                                                                                     | daily 07:00                      | `finance_wish_prices`                                                                                     | —                                                                         |
| Open-Meteo                                 | the forecast; the past days' temperature, rain, sun where the user is                                                                                                                                                      | when asked (kept 6 h in memory)  | `weather_locations` (the place only)                                                                      | `weather.temperature`, `rain`, `sun`                                      |
| OpenStreetMap / Google Places              | names of places                                                                                                                                                                                                            | once per place                   | `activity_place_names`                                                                                    | —                                                                         |
| Google Health                              | the band — see [above](#the-band-google-health-api)                                                                                                                                                                        | hourly (:07)                     | `health_wearable_days`                                                                                    | 🧪 `health.band.*`                                                        |
| Monitoring (own sites)                     | each check: up, status code, response ms; SSL expiry                                                                                                                                                                       | every 5 min                      | `monitoring_monitors`, `monitoring_check_results`                                                         | `monitoring.downMinutes`; project facts (uptime, incidents, SSL days)     |
| The AI providers                           | tokens and requests per day per model                                                                                                                                                                                      | each request                     | `ai_usage`                                                                                                | —                                                                         |

## Typed in by the user

On the site, in the apps or through the Telegram bot (`/d` for the diary, a photo for a receipt
or the diary, answers to the evening habits question and to medication reminders).

| Section     | What                                                                                                                                                                                                                              | Where                                                          | To Links                                                                                    |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Diary       | a day's text (encrypted), word count, mood 1–5, tags, marks (`==emoji text==`), photos with captions                                                                                                                              | `diary_entries`, `diary_photos`                                | `diary.mood`, `diary.words`                                                                 |
| Tasks       | tasks: list, project, due date, priority, horizon (short/normal/long), tags, checklist, repeat, done at; reminders: when, repeat, fired, snoozed                                                                                  | `tasks`, `tasks_lists`, `tasks_reminders`                      | `tasks.done`, `tasks.created`; project facts (open, done)                                   |
| Habits      | alcohol, smoking, gym, custom: the goal; each day clean / marked, with an amount                                                                                                                                                  | `habits`, `habit_days`                                         | `habits.<id>`                                                                               |
| Health      | visits (complaints, findings, recommendations), diagnoses (ICD, status), medications and each intake (taken / skipped, when answered), lab panels and values, studies, documents, allergies, vaccinations, operations, blood type | `health_*` (texts encrypted)                                   | `health.intakes`, `health.visits`, `health.lab.<analyte>`; periods (medications, diagnoses) |
| Psychology  | questionnaires WHO-5, GAD-7, PHQ-9 (answers); life events (dated or by age, feeling); the gentle day's small steps; briefs for an appointment                                                                                     | `psychology_*`                                                 | `psychology.who5`, `gad7`, `phq9`; periods (dated events)                                   |
| Finance     | expenses and income by hand, receipts (photo → AI), recurring payments with price history and contract terms, budgets, assets, wishes                                                                                             | `finance_*`                                                    | (in spending); usage; people (gift ideas for a recipient)                                   |
| Projects    | name, address, aliases, closed on                                                                                                                                                                                                 | `projects`                                                     | the key of project facts                                                                    |
| Birthdays   | name, date, memorial dates                                                                                                                                                                                                        | `birthdays`                                                    | —                                                                                           |
| The vault   | passwords (encrypted on the client)                                                                                                                                                                                               | `vault_*`                                                      | —                                                                                           |
| The AI      | conversations, messages, attachments, the assistant's actions (with undo), memories                                                                                                                                               | `ai_conversations`, `ai_messages`, `ai_actions`, `ai_memories` | `ai.messages`                                                                               |
| Automations | rules: trigger, action, how often fired                                                                                                                                                                                           | `automation_rules`                                             | —                                                                                           |

Computed from the above (server jobs): net worth per day (`finance_net_worth_days`, 23:45), the
monthly finance review (`finance_reports`), the daily chronicle (`lifelog_narratives`), the month
story (`life_stories`), the morning digest (`morning_digest_snapshots`).

## The dashboard itself

| What                                               | Where                                   | To Links                 |
| -------------------------------------------------- | --------------------------------------- | ------------------------ |
| Days the dashboard was opened                      | `dashboard_active_days`                 | —                        |
| Sign-ins: when, IP, browser, outcome               | `sign_ins`; sessions in `auth.sessions` | —                        |
| Achievements unlocked                              | `achievements_unlocked`                 | —                        |
| Notifications sent (Telegram, push), their actions | `notification_outbox`                   | —                        |
| Security findings and reports                      | `security_findings`, `security_reports` | project facts (findings) |
| Background jobs: runs, failures                    | `system.job_runs`, `system.log`         | —                        |

## Moments, periods, projects, people

| Kind       | Section                | What                                                                                                                 |
| ---------- | ---------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Moments    | activity               | `outage` — internet or server outage of a computer (start, end, device)                                              |
| Moments    | music                  | `play` — each play (artist, track)                                                                                   |
| Periods    | health                 | `medication` (start → stop), `diagnosis` (first → last when resolved or in remission); `mind` marks psychiatric ones |
| Periods    | psychology             | `event` — dated life events                                                                                          |
| Project    | activity               | time in windows and focus on the project                                                                             |
| Project    | development            | coding time, stars                                                                                                   |
| Project    | finance                | income, expenses                                                                                                     |
| Project    | monitoring             | uptime, incidents, SSL days                                                                                          |
| Project    | tasks                  | open, done                                                                                                           |
| Project    | security               | findings                                                                                                             |
| Usage      | activity, games, music | time in a program / game, plays of a streaming service                                                               |
| Time spent | activity               | `windows` (by title, 90 days), `focus` (by the session note)                                                         |
| People     | finance                | gift ideas for a recipient                                                                                           |

## Kept but not in Links yet

What is stored at a finer grain or with more fields than Links uses today — the raw material for
the indices and hourly series of v2:

- **Finer than a day.** Computer spans (every switch), phone spans, unlocks, screen on/off,
  notifications, every phone signal, location fixes, site visits, telemetry buckets (≤ 5 min),
  focus sessions, Last.fm plays, Dota matches, WakaTime spans, monitoring checks, computer health
  every 5 min. All have their moment, so hourly series need no new collection.
- **Phone:** notifications per app and per hour; charging and battery; Wi-Fi networks (home /
  work / elsewhere); the ringer mode; what played (apps, artists); mobile data per app; light and
  noise through the day; time per app and per category (Instagram/TikTok for "draining").
- **Places:** time at each named place, trips by mode, the place names and kinds.
- **The band:** average and highest heart rate, light and awake minutes, distance.
- **Computer:** CPU, memory, temperature, battery; focus distractions and completion; limits
  reached; work contexts.
- **Telemetry:** typing pauses, focus entropy, unique apps, scroll depth, copies, page types and
  technologies.
- **Services:** income and net worth per day, wish prices; GitHub followers/stars per day, repo
  stats; WakaTime by language and project; SoundCloud plays per day; Steam per game; Dota K/D/A,
  duration, party; WoW per day; AI tokens.
- **Typed in:** diary tags, marks and photos; task priority, horizon, due dates and reminders;
  habit amounts; the gentle day's steps; sign-ins and opened days.

## How long things are kept

Everything is kept until the user deletes it, except: computer health — 30 days; telemetry
buckets and work contexts — 30 days (`ACTIVITY_CONTEXT_RETENTION_DAYS`); the system log and the
trash — cleaned daily; notifications — pruned daily. Removing a device deletes its history.

# Redesign, round 2 — variants on the 00–06 base

The owner's verdict on round 1: the first proposal (00–06, the graphite "Oracle") is the
favourite; the experiments 10–16 are not the direction. Round 2 keeps 00–06 as the base and
applies the `dashboard-telemetry-ux` skill (`.claude/skills/dashboard-telemetry-ux/SKILL.md`)
to every variant:

- **Tier 1 — global status bar:** system health score, active alerts, MCP status, Telegram bot.
- **Tier 2 — primary widgets:** finance, productivity / time, tasks and notes.
- **Tier 3 — deep telemetry:** server CPU / RAM / disk, containers, detailed logs.
- Trend badges, sparklines and Healthy / Warning / Critical instead of raw logs.
- Toggleable widget blocks; quick-action overlays (transaction, scratchpad note, restart).
- Placements for Ctrl+K, the morning briefing banner and a backup / data-sovereignty indicator.

The owner's answers that still stand: graphite accent (colour only for status and "the
answer"); the desktop menu keeps today's groups, folded; the morning briefing is always on top;
level and achievements are clearly visible. The main pain stays the same: overload.

Open [index.html](index.html) first. Every mockup is self-contained (inline CSS, inline SVG
icons, a little JS; Google Fonts with a system fallback), follows `prefers-color-scheme`, has a
theme switch and a **"Пояснения"** switch in the purple mock bar. With it on, each tier is
outlined and labelled ("Уровень 1 · …") and the designer's note is shown. A dashed
`НОВОЕ` tag marks what the project does not have yet. Numbers are the ones the earlier mockups
took from the live site; invented ones carry an `иллюстрация` tag. Each mockup was checked in
Chrome at 1440 px and at 390 px (no horizontal scroll), in light and dark.

| File                                   | Variant                       | Screens                                     |
| -------------------------------------- | ----------------------------- | ------------------------------------------- |
| [index.html](index.html)               | overview and comparison       | —                                           |
| [a1-home.html](a1-home.html)           | A1 "Три этажа" (three floors) | home                                        |
| [a1-finance.html](a1-finance.html)     | A1                            | Finance, with the quick transaction overlay |
| [a2-home.html](a2-home.html)           | A2 "Кокпит" (cockpit)         | home                                        |
| [a2-system.html](a2-system.html)       | A2                            | System (Tier 3 in depth)                    |
| [a3-home.html](a3-home.html)           | A3 "Одна лента" (one feed)    | home, with the scratchpad                   |
| [a3-tasks.html](a3-tasks.html)         | A3                            | Tasks with three views instead of filters   |
| [b1-now-soon.html](b1-now-soon.html)   | B1 "Сейчас / Скоро"           | home; three scenarios to switch             |
| [b2-statusbar.html](b2-statusbar.html) | B2 "Строка состояния"         | home with an OS-like tray and a dock        |
| [c1-telemetry.html](c1-telemetry.html) | C1 telemetry overview         | one screen of every signal, drill-down      |
| [c2-signals.html](c2-signals.html)     | C2 every signal               | the full matrix with four filters           |

## 1. What exists and what is new (checked in the code)

| Thing                                          | Status                                         | Where it is today                                                                                                                                    |
| ---------------------------------------------- | ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Active alerts                                  | exists                                         | `GET /api/system/status` (`SystemStatus.log`, `jobs`), `IntegrationStatus.state/error`, `integration_alerts` (daily 09:20)                           |
| MCP status                                     | exists (last call); **new** (calls, latency)   | `access-tokens.schema.ts` has `lastUsedAt`; Settings → MCP (`mcp-settings.component.ts`)                                                             |
| Telegram bot                                   | exists (connected, delivery); **new** (ping)   | `telegram-settings.component.ts` (`connected`), `SystemMetrics.notifications` (sent / failed / waiting)                                              |
| Backup and data sovereignty                    | exists                                         | `BackupService` / `BackupStatus` (latest dump, count, `restoreCheck`, client copy); data export (`data-export.service.ts`, `open-export.service.ts`) |
| Sync                                           | exists                                         | `SystemMetrics.sync` (`lastAt`, `pending`, `parked`)                                                                                                 |
| Process memory, requests p95, job runs         | exists                                         | `SystemMetrics` (Settings → System → Metrics, `system-metrics.component.ts`)                                                                         |
| Computer CPU / RAM / disks                     | exists                                         | `activity_health`, every 5 min, kept 30 days                                                                                                         |
| **System health score 0–100**                  | **new**                                        | computed from the above (formula below)                                                                                                              |
| **Server CPU, total RAM, disk, disk forecast** | **new**                                        | the server measures only its own process today                                                                                                       |
| **Containers and their restart**               | **new**                                        | six services in `deploy/compose.yml`: app, db, caddy, languagetool, ollama, backup                                                                   |
| Ctrl+K palette                                 | exists                                         | `palette/command-palette.component.ts`; the round-2 quick actions are new commands in it                                                             |
| Morning briefing                               | exists (Telegram); **new** (web card)          | `ai.morning-digest` (`morning-digest.job.ts`), `morning_digest_snapshots`                                                                            |
| Toggleable / reorderable widgets               | exists                                         | the home "Edit" mode (`dashboard.page.ts`: drag, resize, hide); round 2 adds a plain switch list and per-page blocks                                 |
| Quick transaction                              | exists (form); **new** (overlay from anywhere) | the Finance add-operation dialog                                                                                                                     |
| **Scratchpad note**                            | **new** (keeping a draft); routing exists      | `capture/capture.page.ts` already sends a captured text to a module (task, diary, reminder); tasks have an inbox                                     |

**Health score (new).** 100 minus: 6 per service not answering, 4 per job failing in a row, 15
for a backup older than 26 h or a failed restore check, 10 for a disk over 85 %, 5 per site down,
2 per device or source that never delivered (the band today). 90+ is Healthy, 70–89 Warning,
below 70 Critical. Today: 100 − 12 (LanguageTool, WakaTime) − 2 (the band) = **86, Warning**.
Every lost point is a row in the drill-down with a link to the cause — the score is never shown
without the reason.

## 2. Shared pieces (every variant)

- **Tier 1 data** is the same in every file: health 86, alerts 2 (LanguageTool 17 h, WakaTime
  since 07:40), MCP last call 11:52 (Claude Code), bot 140 ms (new) / 11 delivered / 0 failed,
  backup 03:00 with the restore check of 27.10, sync 12:22. Each item opens the same drill-down
  (a side sheet on desktop, a bottom sheet on the phone).
- **Ctrl+K** opens the palette with four sections: Do (transaction, note, restart, focus),
  Recent, Ask (`?`), and the `>` `/` `?` modes of 03-palette.
- **Quick actions** — one overlay with three tabs: Операция (amount, type, category, place),
  Заметка (scratchpad and where to put it: tasks inbox / today's diary / keep), Перезапуск
  (containers; `db` and `backup` are never restartable from the web).
- **Blocks** — "Настроить / Изменить / Плитки" opens a switch list built from the page's blocks;
  the briefing switch is locked ("always on top — your choice"). A hidden block goes to "Ещё" at
  the bottom of the page, never disappears silently.
- **Phone**: the bottom bar of 02-shell (Главная, AI, Финансы, Жизнь, Ещё); the top bar holds
  search (Ctrl+K) and "+" (quick actions).

## 3. Variants

### A1 "Три этажа" — three floors, low density

**Idea.** The page reads top to bottom exactly along the three tiers, and each floor is quieter
than the one above. Floor 1 is one line of six facts. Floor 2 is three equal cards — money,
time, tasks — each with one big number, one line, one sentence and one action. Floor 3 is
folded into one line with its status and opens on demand. Finance follows the same rule:
the answer and the source freshness, then the balance forecast and categories, then everything
else folded; four tabs and the filters become one month picker.

| Skill item                 | Where                                                                                  |
| -------------------------- | -------------------------------------------------------------------------------------- |
| Tier 1 status bar          | the line under the greeting: health ring, alerts, MCP, bot, backup, sync               |
| Tier 2                     | three cards: Деньги, Время, Дела (+ a row of three small ones)                         |
| Tier 3                     | "Сервер и телеметрия", folded; inside: server, containers, log, computer               |
| Trends instead of logs     | deltas (−26 % к октябрю, +38 мин), sparklines, log as 2 / 3 badges                     |
| Toggleable blocks          | "Настроить главную"                                                                    |
| Quick actions              | "Операция" in Money, "Заметка" in Tasks, "Перезапуск…" in Tier 3; FAB on phone Finance |
| Ctrl+K / briefing / backup | menu search / under the status line, 3 answers / "Копия 03:00" in the status line      |

| Data field                               | UI element                                     |
| ---------------------------------------- | ---------------------------------------------- |
| `SystemStatus` + integrations → health   | ring 0–100 with Healthy / Warning / Critical   |
| `IntegrationStatus.state = error`, `log` | red dot + count "2 сервиса"                    |
| `access_tokens.lastUsedAt`               | time-ago "11:52"                               |
| `SystemMetrics.notifications`            | "11 / 0 / 0" in the bot drill-down             |
| `BackupStatus.latest`, `restoreCheck`    | dot + time "03:00", 14-day strip in drill-down |
| bank balance, 3-month average spend      | big number + sparkline with a dotted forecast  |
| `activity.hours` per hour                | 24-cell heat strip                             |
| `tasks` due today                        | checklist of three                             |
| server CPU / disk (new), `memoryMb`      | meters with a status colour                    |
| containers (new)                         | six status badges                              |

### A2 "Кокпит" — everything at once, high density

**Idea.** For the days the owner wants to see the whole system without clicking. All three
tiers are visible at the same time but in different places: Tier 1 is a sticky toolbar (it
stays on screen while scrolling), Tier 2 a dense grid of tiles on the left, Tier 3 a narrow
"под капотом" column on the right. The briefing is one line of three answers. Each tile is
one number, one delta, one 14-day line. The inner screen is System: one sentence, four Tier 1
cards, four vitals with 24 h lines, containers with restart, 45 jobs as squares, 23 connections
with a 14-day sync strip, the log with repeats collapsed and only two filters.

| Skill item                 | Where                                                                           |
| -------------------------- | ------------------------------------------------------------------------------- |
| Tier 1                     | sticky toolbar of pills (health, alerts, MCP, bot, backup, sync)                |
| Tier 2                     | 3 × 3 tiles: money, screen, coding, tasks, diary, sleep, steps, music           |
| Tier 3                     | right column: server vitals, containers, log digest, computer                   |
| Trends instead of logs     | every tile has a delta and a sparkline; the log is "×231" badges + a 24 h strip |
| Toggleable blocks          | "Изменить" — drag outline + the switch list                                     |
| Quick actions              | "Быстро" in the toolbar; restart icon per container                             |
| Ctrl+K / briefing / backup | search field in the toolbar / one-line banner / "Копия 03:00" pill              |

| Data field                                          | UI element                                              |
| --------------------------------------------------- | ------------------------------------------------------- |
| `SystemJob[]` (45)                                  | grid of squares, red = `failures > 0`, amber = slow     |
| `IntegrationStatus[]` (23)                          | row: dot, `lastSyncedAt` time-ago, 14-day success strip |
| `SystemLogEntry.count`, `firstAt`, `lastAt`         | "×231" badge + "since" + raw entry behind a fold        |
| `SystemMetrics.requests.p95Ms`                      | number + 24 h sparkline                                 |
| disk usage samples (new)                            | sparkline + dotted forecast "~5 мес."                   |
| container state, uptime, memory (new)               | table row + restart button                              |
| `activity.phone.steps`, `music.plays`, `diary.mood` | tile: number + delta + sparkline / heat strip           |

### A3 "Одна лента" — one column, read like a letter

**Idea.** No cards grid: one column with three sections by time — "Сейчас" (Tier 1 as a
sentence with clickable parts, then the briefing and the level line), "Сегодня" (Tier 2 as
rows: icon, what, value, chevron), "Фон" (Tier 3, folded). On a wide screen a scratchpad and four
quick actions sit on the right; on the phone they move below. Tasks lose their filters: three
views by time (Сегодня / Скоро / Всё), lists and projects become a caption, the add field
understands "завтра в 11 #дом !", and the scratchpad sits above the list until sorted.

| Skill item                 | Where                                                                    |
| -------------------------- | ------------------------------------------------------------------------ |
| Tier 1                     | the first sentence of "Сейчас"; each part opens a drill-down             |
| Tier 2                     | the "Сегодня" rows                                                       |
| Tier 3                     | "Фон", folded: server, containers, connections, devices                  |
| Trends instead of logs     | small sparkline in each row; "больше обычного" in words                  |
| Toggleable blocks          | "Строки"                                                                 |
| Quick actions              | scratchpad + four buttons on the right                                   |
| Ctrl+K / briefing / backup | button on the right / under the sentence / "копия 03:00" in the sentence |

| Data field                    | UI element                                      |
| ----------------------------- | ----------------------------------------------- |
| health + alerts + MCP + bot   | one sentence with inline status dots            |
| each Tier 2 source            | list row with a value and an optional sparkline |
| `tasks.due`, reminders        | grouped rows "Сегодня / Скоро", a time badge    |
| `tasks.done`, `tasks.created` | two sparklines in the folded "Неделя"           |
| devices `lastSeen`            | dot + "8 мин назад"                             |

### B1 "Сейчас / Скоро" — a bento by urgency, the future on the right (experimental)

**Idea.** The home splits in two. Left — **now**: tiles whose size and place follow urgency;
the urgent is big and on top, the calm is small and below, and every promoted tile says why
("наверху: 2 сервиса молчат"). Right — **soon**: a timeline of the future with confidence
(sleep tonight, the birthday on Tuesday, salary on the 10th, the disk in spring). The briefing
is always the first and widest tile. Tiles move only at three moments (morning, an incident,
evening) — never live — so the page does not jump under the hand. The mockup has the three
scenarios as buttons. On the phone the halves become two tabs.

| Skill item                 | Where                                                           |
| -------------------------- | --------------------------------------------------------------- |
| Tier 1                     | the status line above both halves                               |
| Tier 2                     | the bento ("now") and the timeline ("soon")                     |
| Tier 3                     | the System tile grows to 2 × 2 and turns red on an incident     |
| Trends instead of logs     | urgency reason above a tile; confidence bars in the timeline    |
| Toggleable blocks          | "Плитки"                                                        |
| Quick actions              | inside tiles (Операция, Перезапуск)                             |
| Ctrl+K / briefing / backup | menu / first tile / the Копия tile, promoted during an incident |

| Data field                                                   | UI element                                      |
| ------------------------------------------------------------ | ----------------------------------------------- |
| urgency = due time, alert level, streak at risk              | tile size (small / wide / big) and order        |
| mood forecast, balance projection, SSL expiry, disk forecast | timeline node + confidence bar                  |
| `BackupStatus` during an outage                              | the Копия tile moves up: "последняя копия цела" |

### B2 "Строка состояния" — an OS-like shell (experimental)

**Idea.** The dashboard behaves like an operating system. The side menu goes: sections open
from "Разделы" at the top left (the same five folded groups), and the right of the top bar is a
tray — health, alerts, MCP, bot, backup, sync, level, clock. Each icon opens a popover in place,
so Tier 1 is reachable from any page (Finance, Diary) without leaving it. The home is a desk of
small windows with a × to hide and "+ Окно" to bring back. A dock at the bottom holds the quick
actions.

| Skill item                 | Where                                                         |
| -------------------------- | ------------------------------------------------------------- |
| Tier 1                     | the tray, on every page                                       |
| Tier 2                     | windows: money, tasks, time, diary, sleep                     |
| Tier 3                     | windows "Сервер", "Контейнеры"; tray popovers                 |
| Trends instead of logs     | popovers: 14-day lines, status badges                         |
| Toggleable blocks          | × on each window, "+ Окно"                                    |
| Quick actions              | the dock: Операция, Заметка, Фокус 25, Перезапуск, Спросить   |
| Ctrl+K / briefing / backup | search field in the top bar / pinned notification / tray icon |

**Risk:** it goes against "the menu as it is now". If the owner likes the tray, the safer
graft is the tray alone on top of A1 or A3 (see the rollout).

### C1 "Телеметрия одним экраном" and C2 "Все сигналы"

**Idea.** C1 puts every signal of `docs/telemetry.md` on one screen, grouped by meaning, not by
source, in 11 tiles. Each tile shows its 3–5 most telling signals, each with the element that
fits its unit; the tile border takes the colour of its worst signal; the footer counts the rest
and opens all of them with a 30-day strip. The Tier 1 line also shows coverage: how many
signals are fine, questionable, failing or waiting for data. C2 is the same list as a matrix —
one row per signal: state dot, human name, key, element, mini view, a 30-day strip where a
hatched day is "unknown", not zero (the `missing: 'absent'` rule), today's value and the delta
to the 28-day median. Four filters that answer questions: Все / Что не так / Ждут данных / В норме.

**Element per unit** (the rule both use):

| Unit or kind                                           | Element                                                             |
| ------------------------------------------------------ | ------------------------------------------------------------------- |
| `hours`, `money`, `degrees`, steady counts             | sparkline of 14 days + delta to the 28-day median                   |
| rare `count` (commits, matches, calls, visits)         | heat strip of 14 / 30 days                                          |
| `percent`, 0–100 `score`                               | ring                                                                |
| `clock` (first / last use, bedtime, wake, alarm)       | 24 h scale from 04:00, a tick for today, a band for the usual range |
| `partOf` (categories, sites, genres, late games)       | share bar                                                           |
| freshness of a device or a source                      | status dot + time-ago                                               |
| capacity (disk, memory, limits)                        | meter                                                               |
| moments (`outage`, `play`, visits, labs)               | ticks on a line                                                     |
| periods (medication, diagnosis, life events)           | bars on a line                                                      |
| many of a kind (23 connections, 45 jobs, 6 containers) | dot matrix                                                          |

**Summary.** 158 signals in 11 groups: 101 fine, 31 not seen yet, 11 warning, 5 critical, 3 no data lately, 7 partial. The families (`activity.site.<site>`,
`finance.spent.<category>`, `habits.<id>`, `health.lab.<analyte>`, `music.genre.<genre>`) are one
row each and expand in the drill-down. Everything fits an element. Five signals fit only as
"exists, see the section", not as a number: the security report of the phone, work contexts,
the raw telemetry fields not in Links (typing pauses, focus entropy, scroll depth, copies, page
types), the notifications outbox and the daily chronicle; they get a status dot and a link,
never a chart. Signals marked "never seen on real data" in `telemetry.md` (the band, movies,
four phone collectors) are drawn hatched with "Ждёт данных" — they are not hidden, because
seeing that the band never synced is itself the useful fact.

**Full table: signal → element → where.** "C1" = the tile (headline signals are on the tile
itself, the rest in its drill-down); "C2" = a row of the matrix (every signal has one); "T1" =
also in the Tier 1 bar of every variant; "page" = the section page that already shows it.

| Group                 | Signal key                                        | What                                                                        | Element                | Where                                                           | State today    |
| --------------------- | ------------------------------------------------- | --------------------------------------------------------------------------- | ---------------------- | --------------------------------------------------------------- | -------------- |
| Устройства и сбор     | `device.phone`                                    | Телефон REDMI 17 — отправил                                                 | status dot + time-ago  | C1 tile · C2 · page: Settings → Devices, Activity → Phone       | fine           |
| Устройства и сбор     | `device.desktop`                                  | Компьютер — отправил                                                        | status dot + time-ago  | C1 tile · C2 · page: Settings → Devices, Activity → Phone       | fine           |
| Устройства и сбор     | `device.extension`                                | Расширение Chrome — отправило                                               | status dot + time-ago  | C1 tile · C2 · page: Settings → Devices, Activity → Phone       | fine           |
| Устройства и сбор     | `device.band`                                     | Браслет (Google Health / Health Connect)                                    | status dot + time-ago  | C1 tile · C2 · T1 · page: Settings → Devices, Activity → Phone  | not seen yet   |
| Устройства и сбор     | `activity.phone.batteryMaxC`                      | Батарея телефона, макс. °C                                                  | sparkline 14 d + delta | C1 drill-down · C2 · page: Settings → Devices, Activity → Phone | not seen yet   |
| Устройства и сбор     | `phone.battery`                                   | Батарея: уровень, здоровье, зарядка                                         | meter                  | C1 drill-down · C2 · page: Settings → Devices, Activity → Phone | not seen yet   |
| Устройства и сбор     | `phone.security`                                  | Отчёт безопасности телефона                                                 | status dot + time-ago  | C1 drill-down · C2 · page: Settings → Devices, Activity → Phone | not seen yet   |
| Устройства и сбор     | `phone.country`                                   | Страна мобильной сети                                                       | counter                | C1 drill-down · C2 · page: Settings → Devices, Activity → Phone | not seen yet   |
| Устройства и сбор     | `phone.wifi`                                      | Wi-Fi: сеть сейчас                                                          | counter                | C1 drill-down · C2 · page: Settings → Devices, Activity → Phone | fine           |
| Устройства и сбор     | `app.versions`                                    | Версии приложений (телефон, компьютер)                                      | counter                | C1 drill-down · C2 · page: Settings → Devices, Activity → Phone | fine           |
| Устройства и сбор     | `push.devices`                                    | Push-токены                                                                 | status dot + time-ago  | C1 drill-down · C2 · page: Settings → Devices, Activity → Phone | fine           |
| Устройства и сбор     | `desktop.health`                                  | Компьютер: ЦП, память, диски, аптайм                                        | meter                  | C1 tile · C2 · page: Settings → Devices, Activity → Phone       | fine           |
| Устройства и сбор     | `desktop.system`                                  | Компьютер: температура, GPU, батарея, Defender, обновления                  | status dot + time-ago  | C1 drill-down · C2 · page: Settings → Devices, Activity → Phone | warning        |
| Устройства и сбор     | `activity.outage`                                 | Обрывы интернета и сервера (моменты)                                        | ticks on a line        | C1 drill-down · C2 · page: Settings → Devices, Activity → Phone | fine           |
| Устройства и сбор     | `desktop.copies`                                  | Копии данных на компьютере                                                  | status dot + time-ago  | C1 drill-down · C2 · page: Settings → Devices, Activity → Phone | fine           |
| Сон и тело            | `activity.phone.rest`                             | Сон по телефону (экран выключен)                                            | sparkline 14 d + delta | C1 tile · C2 · page: Health → Band                              | fine           |
| Сон и тело            | `health.band.sleep`                               | Сон по браслету                                                             | sparkline 14 d + delta | C1 tile · C2 · page: Health → Band                              | not seen yet   |
| Сон и тело            | `health.band.deepSleep`                           | Глубокий сон                                                                | share bar              | C1 drill-down · C2 · page: Health → Band                        | not seen yet   |
| Сон и тело            | `health.band.remSleep`                            | REM-сон                                                                     | share bar              | C1 drill-down · C2 · page: Health → Band                        | not seen yet   |
| Сон и тело            | `health.band.bedtime`                             | Уснул                                                                       | 24 h scale             | C1 drill-down · C2 · page: Health → Band                        | not seen yet   |
| Сон и тело            | `health.band.wake`                                | Проснулся                                                                   | 24 h scale             | C1 drill-down · C2 · page: Health → Band                        | not seen yet   |
| Сон и тело            | `health.band.sleepScore`                          | Оценка сна                                                                  | ring 0–100             | C1 tile · C2 · page: Health → Band                              | not seen yet   |
| Сон и тело            | `health.band.restingHeartRate`                    | Пульс в покое                                                               | sparkline 14 d + delta | C1 tile · C2 · page: Health → Band                              | not seen yet   |
| Сон и тело            | `health.band.hrv`                                 | HRV                                                                         | sparkline 14 d + delta | C1 drill-down · C2 · page: Health → Band                        | not seen yet   |
| Сон и тело            | `health.band.spo2`                                | SpO2                                                                        | ring 0–100             | C1 drill-down · C2 · page: Health → Band                        | not seen yet   |
| Сон и тело            | `health.band.stress`                              | Стресс за день                                                              | ring 0–100             | C1 tile · C2 · page: Health → Band                              | not seen yet   |
| Сон и тело            | `health.band.resilience`                          | Восстановление                                                              | ring 0–100             | C1 drill-down · C2 · page: Health → Band                        | not seen yet   |
| Сон и тело            | `health.band.reactions`                           | Реакции тела                                                                | heat strip             | C1 drill-down · C2 · page: Health → Band                        | not seen yet   |
| Сон и тело            | `health.band.mindfulness`                         | Минуты осознанности                                                         | heat strip             | C1 drill-down · C2 · page: Health → Band                        | not seen yet   |
| Сон и тело            | `health.band.skinTemp`                            | Температура кожи ночью                                                      | sparkline 14 d + delta | C1 drill-down · C2 · page: Health → Band                        | not seen yet   |
| Сон и тело            | `health.band.steps`                               | Шаги по браслету                                                            | sparkline 14 d + delta | C1 drill-down · C2 · page: Health → Band                        | not seen yet   |
| Сон и тело            | `health.band.calories`                            | Калории                                                                     | sparkline 14 d + delta | C1 drill-down · C2 · page: Health → Band                        | not seen yet   |
| Сон и тело            | `health.band.zoneMinutes`                         | Минуты в зонах пульса                                                       | heat strip             | C1 drill-down · C2 · page: Health → Band                        | not seen yet   |
| Сон и тело            | `band.minutes`                                    | Пульс и шаги поминутно; часы; стресс по часам                               | heat strip             | C1 drill-down · C2 · page: Health → Band                        | not seen yet   |
| Экран и внимание      | `activity.hours`                                  | За экранами (все устройства)                                                | sparkline 14 d + delta | C1 tile · C2 · page: Activity                                   | warning        |
| Экран и внимание      | `activity.focus`                                  | Фокус-сессии                                                                | sparkline 14 d + delta | C1 tile · C2 · page: Activity                                   | fine           |
| Экран и внимание      | `activity.phone.unlocks`                          | Разблокировки                                                               | sparkline 14 d + delta | C1 tile · C2 · page: Activity                                   | fine           |
| Экран и внимание      | `activity.firstUse`                               | Первое касание дня                                                          | 24 h scale             | C1 drill-down · C2 · page: Activity                             | fine           |
| Экран и внимание      | `activity.lastUse`                                | Последнее касание дня                                                       | 24 h scale             | C1 tile · C2 · page: Activity                                   | warning        |
| Экран и внимание      | `activity.phone.firstUse`                         | Телефон: первое                                                             | 24 h scale             | C1 drill-down · C2 · page: Activity                             | fine           |
| Экран и внимание      | `activity.phone.lastUse`                          | Телефон: последнее                                                          | 24 h scale             | C1 drill-down · C2 · page: Activity                             | fine           |
| Экран и внимание      | `activity.phone.night`                            | Телефон 23:00–04:00                                                         | sparkline 14 d + delta | C1 drill-down · C2 · page: Activity                             | warning        |
| Экран и внимание      | `activity.browser`                                | В браузере                                                                  | sparkline 14 d + delta | C1 drill-down · C2 · page: Activity                             | fine           |
| Экран и внимание      | `activity.site.<site>`                            | Топ-6 сайтов (доля браузера)                                                | share bar              | C1 tile · C2 · page: Activity                                   | fine           |
| Экран и внимание      | `activity.phone.notificationsOpened`              | Открыто уведомлений                                                         | ring 0–100             | C1 drill-down · C2 · page: Activity                             | not seen yet   |
| Экран и внимание      | `activity.phone.secondsToOpen`                    | Секунд до открытия уведомления                                              | sparkline 14 d + delta | C1 drill-down · C2 · page: Activity                             | not seen yet   |
| Экран и внимание      | `activity.phone.dnd`                              | Не беспокоить                                                               | sparkline 14 d + delta | C1 drill-down · C2 · page: Activity                             | fine           |
| Экран и внимание      | `phone.notifications`                             | Уведомления по приложениям и часам                                          | top list               | C1 drill-down · C2 · page: Activity                             | fine           |
| Экран и внимание      | `activity.limits`                                 | Дневные лимиты и когда достигнуты                                           | meter                  | C1 drill-down · C2 · page: Activity                             | fine           |
| Экран и внимание      | `activity.spans`                                  | Окна и приложения (каждое переключение)                                     | top list               | C1 drill-down · C2 · page: Activity                             | fine           |
| Работа и код          | `development.coding`                              | Кодинг (WakaTime)                                                           | sparkline 14 d + delta | C1 tile · C2 · page: Development, Activity, Tasks               | critical       |
| Работа и код          | `development.commits`                             | Коммиты (GitHub, GitLab, Bitbucket)                                         | heat strip             | C1 tile · C2 · page: Development, Activity, Tasks               | fine           |
| Работа и код          | `tasks.done`                                      | Задач сделано                                                               | heat strip             | C1 tile · C2 · page: Development, Activity, Tasks               | fine           |
| Работа и код          | `tasks.created`                                   | Задач создано                                                               | heat strip             | C1 drill-down · C2 · page: Development, Activity, Tasks         | fine           |
| Работа и код          | `activity.telemetry.desktop.inputPerMinute`       | Нажатий в минуту (VS)                                                       | sparkline 14 d + delta | C1 drill-down · C2 · page: Development, Activity, Tasks         | no data lately |
| Работа и код          | `activity.telemetry.desktop.inputCount`           | Нажатий всего (VS)                                                          | sparkline 14 d + delta | C1 drill-down · C2 · page: Development, Activity, Tasks         | no data lately |
| Работа и код          | `activity.telemetry.desktop.backspacePercent`     | Доля исправлений                                                            | ring 0–100             | C1 drill-down · C2 · page: Development, Activity, Tasks         | no data lately |
| Работа и код          | `activity.telemetry.desktop.contextSwitches`      | Переключения контекста                                                      | sparkline 14 d + delta | C1 tile · C2 · page: Development, Activity, Tasks               | warning        |
| Работа и код          | `activity.telemetry.desktop.focusHours`           | Время в одной программе подряд                                              | sparkline 14 d + delta | C1 drill-down · C2 · page: Development, Activity, Tasks         | fine           |
| Работа и код          | `activity.telemetry.desktop.terminalCommands`     | Команд в терминале                                                          | sparkline 14 d + delta | C1 drill-down · C2 · page: Development, Activity, Tasks         | fine           |
| Работа и код          | `activity.telemetry.desktop.terminalFailures`     | Неудачных команд                                                            | heat strip             | C1 drill-down · C2 · page: Development, Activity, Tasks         | fine           |
| Работа и код          | `activity.telemetry.desktop.terminalErrorPercent` | Доля неудачных команд                                                       | ring 0–100             | C1 drill-down · C2 · page: Development, Activity, Tasks         | fine           |
| Работа и код          | `activity.telemetry.desktop.buildWaitHours`       | Ожидание сборки                                                             | sparkline 14 d + delta | C1 drill-down · C2 · page: Development, Activity, Tasks         | fine           |
| Работа и код          | `activity.telemetry.browser.readingHours`         | Чтение в браузере                                                           | sparkline 14 d + delta | C1 drill-down · C2 · page: Development, Activity, Tasks         | fine           |
| Работа и код          | `telemetry.raw`                                   | Паузы набора, энтропия фокуса, глубина прокрутки, копирования, типы страниц | top list               | C1 drill-down · C2 · page: Development, Activity, Tasks         | fine           |
| Работа и код          | `activity.workstates`                             | Рабочие контексты                                                           | counter                | C1 drill-down · C2 · page: Development, Activity, Tasks         | fine           |
| Работа и код          | `screenshots.taken`                               | Скриншоты                                                                   | heat strip             | C1 drill-down · C2 · page: Development, Activity, Tasks         | fine           |
| Работа и код          | `writing.fixes`                                   | Принятые правки текста                                                      | counter                | C1 drill-down · C2 · page: Development, Activity, Tasks         | critical       |
| Работа и код          | `github.profile`                                  | GitHub: звёзды, подписчики, репозитории по дням                             | sparkline 14 d + delta | C1 drill-down · C2 · page: Development, Activity, Tasks         | fine           |
| Работа и код          | `opensource.repos`                                | Open Source: звёзды, форки, issues, загрузки npm                            | sparkline 14 d + delta | C1 drill-down · C2 · page: Development, Activity, Tasks         | fine           |
| Деньги                | `finance.spent`                                   | Расходы                                                                     | sparkline 14 d + delta | C1 tile · C2 · page: Finance                                    | fine           |
| Деньги                | `finance.spent.<category>`                        | Расходы по категориям                                                       | share bar              | C1 tile · C2 · page: Finance                                    | fine           |
| Деньги                | `finance.balance`                                 | Остаток (банк); прогноз — новое                                             | sparkline 14 d + delta | C1 tile · C2 · page: Finance                                    | fine           |
| Деньги                | `finance.netWorth`                                | Капитал по дням                                                             | sparkline 14 d + delta | C1 drill-down · C2 · page: Finance                              | fine           |
| Деньги                | `finance.costs`                                   | Расходы Hetzner и DeepSeek                                                  | counter                | C1 drill-down · C2 · page: Finance                              | fine           |
| Деньги                | `finance.wishPrices`                              | Цены желаний                                                                | sparkline 14 d + delta | C1 drill-down · C2 · page: Finance                              | fine           |
| Деньги                | `finance.usage`                                   | Используются ли подписки                                                    | top list               | C1 tile · C2 · page: Finance                                    | warning        |
| Деньги                | `finance.reports`                                 | Разбор месяца                                                               | counter                | C1 drill-down · C2 · page: Finance                              | fine           |
| Настроение и здоровье | `diary.mood`                                      | Настроение (дневник)                                                        | sparkline 14 d + delta | C1 tile · C2 · page: Diary, Health, Psychology, Habits          | fine           |
| Настроение и здоровье | `diary.words`                                     | Слов в дневнике                                                             | heat strip             | C1 tile · C2 · page: Diary, Health, Psychology, Habits          | warning        |
| Настроение и здоровье | `habits.<habit id>`                               | Привычки (каждая)                                                           | heat strip             | C1 tile · C2 · page: Diary, Health, Psychology, Habits          | fine           |
| Настроение и здоровье | `health.intakes`                                  | Приём лекарств                                                              | ring 0–100             | C1 tile · C2 · page: Diary, Health, Psychology, Habits          | fine           |
| Настроение и здоровье | `health.visits`                                   | Визиты к врачу                                                              | ticks on a line        | C1 drill-down · C2 · page: Diary, Health, Psychology, Habits    | fine           |
| Настроение и здоровье | `health.lab.<analyte>`                            | Анализы (каждый показатель)                                                 | ticks on a line        | C1 drill-down · C2 · page: Diary, Health, Psychology, Habits    | fine           |
| Настроение и здоровье | `psychology.who5`                                 | WHO-5                                                                       | sparkline 14 d + delta | C1 drill-down · C2 · page: Diary, Health, Psychology, Habits    | fine           |
| Настроение и здоровье | `psychology.gad7`                                 | GAD-7                                                                       | sparkline 14 d + delta | C1 drill-down · C2 · page: Diary, Health, Psychology, Habits    | fine           |
| Настроение и здоровье | `psychology.phq9`                                 | PHQ-9                                                                       | sparkline 14 d + delta | C1 drill-down · C2 · page: Diary, Health, Psychology, Habits    | fine           |
| Настроение и здоровье | `health.periods`                                  | Лекарства и диагнозы (периоды)                                              | bars on a line         | C1 drill-down · C2 · page: Diary, Health, Psychology, Habits    | fine           |
| Настроение и здоровье | `psychology.events`                               | Жизненные события (периоды)                                                 | bars on a line         | C1 drill-down · C2 · page: Diary, Health, Psychology, Habits    | fine           |
| Настроение и здоровье | `life.mood.forecast`                              | Прогноз настроения                                                          | sparkline 14 d + delta | C1 drill-down · C2 · page: Diary, Health, Psychology, Habits    | fine           |
| Движение и места      | `activity.phone.steps`                            | Шаги (телефон)                                                              | sparkline 14 d + delta | C1 tile · C2 · page: Activity → Places                          | fine           |
| Движение и места      | `activity.places.km`                              | Путь за день, км                                                            | sparkline 14 d + delta | C1 tile · C2 · page: Activity → Places                          | fine           |
| Движение и места      | `activity.places.home`                            | Дома                                                                        | sparkline 14 d + delta | C1 tile · C2 · page: Activity → Places                          | fine           |
| Движение и места      | `activity.places.count`                           | Остановок                                                                   | heat strip             | C1 drill-down · C2 · page: Activity → Places                    | fine           |
| Движение и места      | `activity.places.walk`                            | Пешком                                                                      | sparkline 14 d + delta | C1 drill-down · C2 · page: Activity → Places                    | partial        |
| Движение и места      | `activity.places.onTheWay`                        | В пути                                                                      | sparkline 14 d + delta | C1 drill-down · C2 · page: Activity → Places                    | fine           |
| Движение и места      | `activity.places.newPlaces`                       | Новых мест                                                                  | heat strip             | C1 drill-down · C2 · page: Activity → Places                    | fine           |
| Движение и места      | `places.presence`                                 | Где сейчас (для автоматизаций)                                              | status dot + time-ago  | C1 drill-down · C2 · page: Activity → Places                    | fine           |
| Движение и места      | `places.names`                                    | Названия мест                                                               | counter                | C1 drill-down · C2 · page: Activity → Places                    | fine           |
| Среда и телефон       | `weather.temperature`                             | Температура                                                                 | sparkline 14 d + delta | C1 tile · C2 · page: Weather, Activity → Phone                  | fine           |
| Среда и телефон       | `weather.rain`                                    | Дождь, мм                                                                   | heat strip             | C1 drill-down · C2 · page: Weather, Activity → Phone            | fine           |
| Среда и телефон       | `weather.sun`                                     | Солнце, ч                                                                   | sparkline 14 d + delta | C1 drill-down · C2 · page: Weather, Activity → Phone            | fine           |
| Среда и телефон       | `activity.phone.daylight`                         | Дневной свет > 1000 лк                                                      | sparkline 14 d + delta | C1 tile · C2 · page: Weather, Activity → Phone                  | fine           |
| Среда и телефон       | `activity.phone.noise`                            | Шум, дБ                                                                     | sparkline 14 d + delta | C1 tile · C2 · page: Weather, Activity → Phone                  | fine           |
| Среда и телефон       | `activity.phone.headphones`                       | В наушниках                                                                 | sparkline 14 d + delta | C1 drill-down · C2 · page: Weather, Activity → Phone            | partial        |
| Среда и телефон       | `activity.phone.car`                              | В машине                                                                    | heat strip             | C1 drill-down · C2 · page: Weather, Activity → Phone            | partial        |
| Среда и телефон       | `activity.phone.media`                            | Что-то играло                                                               | sparkline 14 d + delta | C1 drill-down · C2 · page: Weather, Activity → Phone            | fine           |
| Среда и телефон       | `activity.phone.calls`                            | Звонки                                                                      | heat strip             | C1 tile · C2 · page: Weather, Activity → Phone                  | partial        |
| Среда и телефон       | `activity.phone.callMinutes`                      | Минуты звонков                                                              | heat strip             | C1 drill-down · C2 · page: Weather, Activity → Phone            | partial        |
| Среда и телефон       | `activity.phone.people`                           | Разных людей                                                                | heat strip             | C1 drill-down · C2 · page: Weather, Activity → Phone            | partial        |
| Среда и телефон       | `activity.phone.photos`                           | Фото                                                                        | heat strip             | C1 drill-down · C2 · page: Weather, Activity → Phone            | fine           |
| Среда и телефон       | `activity.phone.mobileData`                       | Мобильный интернет, МБ                                                      | sparkline 14 d + delta | C1 drill-down · C2 · page: Weather, Activity → Phone            | fine           |
| Среда и телефон       | `activity.phone.alarm`                            | Будильник на утро                                                           | 24 h scale             | C1 drill-down · C2 · page: Weather, Activity → Phone            | not seen yet   |
| Досуг                 | `music.plays`                                     | Прослушивания (Last.fm)                                                     | sparkline 14 d + delta | C1 tile · C2 · page: Music, Games, Movies                       | fine           |
| Досуг                 | `music.genre.<genre>`                             | 5 главных жанров (доля)                                                     | share bar              | C1 drill-down · C2 · page: Music, Games, Movies                 | fine           |
| Досуг                 | `music.play`                                      | Каждое прослушивание (моменты)                                              | ticks on a line        | C1 drill-down · C2 · page: Music, Games, Movies                 | fine           |
| Досуг                 | `music.soundcloud`                                | SoundCloud: свои треки, подписчики                                          | sparkline 14 d + delta | C1 drill-down · C2 · page: Music, Games, Movies                 | fine           |
| Досуг                 | `activity.games`                                  | Игры (по окнам)                                                             | sparkline 14 d + delta | C1 tile · C2 · page: Music, Games, Movies                       | fine           |
| Досуг                 | `activity.lateGames`                              | Игры после 23:00 (доля)                                                     | share bar              | C1 drill-down · C2 · page: Music, Games, Movies                 | fine           |
| Досуг                 | `games.steam`                                     | Steam, часы                                                                 | sparkline 14 d + delta | C1 drill-down · C2 · page: Music, Games, Movies                 | fine           |
| Досуг                 | `games.dotaMatches`                               | Матчи Dota                                                                  | heat strip             | C1 tile · C2 · page: Music, Games, Movies                       | fine           |
| Досуг                 | `games.dotaLateMatches`                           | Матчи после 23:00                                                           | share bar              | C1 drill-down · C2 · page: Music, Games, Movies                 | fine           |
| Досуг                 | `games.dotaWins`                                  | Победы Dota                                                                 | ring 0–100             | C1 drill-down · C2 · page: Music, Games, Movies                 | fine           |
| Досуг                 | `games.wow`                                       | WoW: уровень предметов, рейтинг М+, токен                                   | sparkline 14 d + delta | C1 drill-down · C2 · page: Music, Games, Movies                 | partial        |
| Досуг                 | `games.xbox`                                      | Xbox: очки, ачивки                                                          | counter                | C1 drill-down · C2 · page: Music, Games, Movies                 | fine           |
| Досуг                 | `movies.hours`                                    | Кино и видео                                                                | sparkline 14 d + delta | C1 tile · C2 · page: Music, Games, Movies                       | not seen yet   |
| Досуг                 | `movies.lateHours`                                | Кино после 23:00                                                            | share bar              | C1 drill-down · C2 · page: Music, Games, Movies                 | not seen yet   |
| Досуг                 | `movies.videoHours`                               | Видео (YouTube и др.)                                                       | share bar              | C1 drill-down · C2 · page: Music, Games, Movies                 | not seen yet   |
| Досуг                 | `movies.episodes`                                 | Серий                                                                       | heat strip             | C1 drill-down · C2 · page: Music, Games, Movies                 | not seen yet   |
| Подключения           | `integrations.state`                              | 23 подключения: состояние                                                   | dot matrix             | C1 tile · C2 · T1 · page: Settings → Integrations, Monitoring   | critical       |
| Подключения           | `integrations.lastSyncedAt`                       | Последняя синхронизация каждого                                             | status dot + time-ago  | C1 tile · C2 · page: Settings → Integrations, Monitoring        | warning        |
| Подключения           | `integrations.expiresAt`                          | Сроки токенов                                                               | counter                | C1 drill-down · C2 · page: Settings → Integrations, Monitoring  | fine           |
| Подключения           | `integration_alerts`                              | Ежедневная проверка 09:20                                                   | status dot + time-ago  | C1 drill-down · C2 · page: Settings → Integrations, Monitoring  | fine           |
| Подключения           | `monitoring.downMinutes`                          | Минуты падения сайтов                                                       | heat strip             | C1 tile · C2 · page: Settings → Integrations, Monitoring        | fine           |
| Подключения           | `monitoring.checks`                               | Проверки сайтов: код, мс, SSL                                               | sparkline 14 d + delta | C1 drill-down · C2 · page: Settings → Integrations, Monitoring  | fine           |
| Подключения           | `ai.usage`                                        | Токены AI по моделям                                                        | sparkline 14 d + delta | C1 drill-down · C2 · page: Settings → Integrations, Monitoring  | fine           |
| Сервер и дашборд      | `system.health` (new)                             | Здоровье системы (0–100)                                                    | ring 0–100             | C1 tile · C2 · T1 · page: System (A2)                           | warning        |
| Сервер и дашборд      | `system.memoryMb`                                 | Память процесса                                                             | meter                  | C1 tile · C2 · page: System (A2)                                | fine           |
| Сервер и дашборд      | `system.requests`                                 | Запросы: всего, 5xx, p95                                                    | sparkline 14 d + delta | C1 tile · C2 · page: System (A2)                                | fine           |
| Сервер и дашборд      | `system.jobs`                                     | Фоновые задачи: запуски, сбои                                               | dot matrix             | C1 tile · C2 · page: System (A2)                                | warning        |
| Сервер и дашборд      | `system.log`                                      | Журнал ошибок и предупреждений                                              | counter                | C1 drill-down · C2 · T1 · page: System (A2)                     | critical       |
| Сервер и дашборд      | `system.notifications`                            | Уведомления: доставлено, не дошло, ждут                                     | counter                | C1 drill-down · C2 · page: System (A2)                          | fine           |
| Сервер и дашборд      | `system.sync`                                     | Синхронизация: когда, очередь                                               | status dot + time-ago  | C1 drill-down · C2 · T1 · page: System (A2)                     | fine           |
| Сервер и дашборд      | `system.backup`                                   | Копии и проверка восстановления                                             | status dot + time-ago  | C1 drill-down · C2 · T1 · page: System (A2)                     | fine           |
| Сервер и дашборд      | `mcp.tokens`                                      | MCP: токены, последний вызов                                                | status dot + time-ago  | C1 drill-down · C2 · T1 · page: System (A2)                     | fine           |
| Сервер и дашборд      | `telegram.bot`                                    | Telegram-бот: связь                                                         | status dot + time-ago  | C1 drill-down · C2 · T1 · page: System (A2)                     | fine           |
| Сервер и дашборд      | `server.cpu` (new)                                | ЦП сервера                                                                  | meter                  | C1 drill-down · C2 · page: System (A2)                          | fine           |
| Сервер и дашборд      | `server.disk` (new)                               | Диск сервера и прогноз                                                      | meter                  | C1 drill-down · C2 · page: System (A2)                          | fine           |
| Сервер и дашборд      | `server.containers` (new)                         | Контейнеры                                                                  | dot matrix             | C1 drill-down · C2 · page: System (A2)                          | critical       |
| Сервер и дашборд      | `ai.messages`                                     | Сообщений ассистенту                                                        | heat strip             | C1 drill-down · C2 · page: System (A2)                          | fine           |
| Сервер и дашборд      | `dashboard.activeDays`                            | Дни, когда открыт дашборд                                                   | heat strip             | C1 drill-down · C2 · page: System (A2)                          | fine           |
| Сервер и дашборд      | `sign_ins`                                        | Входы: когда, откуда, итог                                                  | top list               | C1 drill-down · C2 · page: System (A2)                          | fine           |
| Сервер и дашборд      | `achievements.unlocked`                           | Ачивки                                                                      | counter                | C1 drill-down · C2 · page: System (A2)                          | fine           |
| Сервер и дашборд      | `security.findings`                               | Находки безопасности                                                        | counter                | C1 drill-down · C2 · page: System (A2)                          | warning        |
| Сервер и дашборд      | `automations.fired`                               | Автоматизации: срабатывания                                                 | counter                | C1 drill-down · C2 · page: System (A2)                          | fine           |
| Сервер и дашборд      | `notification_outbox`                             | Уведомления: прочитано, ответ                                               | top list               | C1 drill-down · C2 · page: System (A2)                          | not seen yet   |
| Сервер и дашборд      | `digest.snapshot`                                 | Утренний дайджест                                                           | status dot + time-ago  | C1 drill-down · C2 · page: System (A2)                          | fine           |
| Сервер и дашборд      | `life.narratives`                                 | Хроника дня и рассказ месяца                                                | status dot + time-ago  | C1 drill-down · C2 · page: System (A2)                          | fine           |

## 4. Tokens and components to add

Colours, type, spacing, radius and motion stay as in [../README.md](../README.md) §3. New:

| Token                         | Dark                                         | Light                                    | Use                                     |
| ----------------------------- | -------------------------------------------- | ---------------------------------------- | --------------------------------------- |
| `--pd-heat-0` … `--pd-heat-3` | on-surface 7 %, chart-primary 28 / 52 / 80 % | on-surface 7 %, `#374151` 25 / 50 / 82 % | heat strips, share bars, job grid       |
| unknown day pattern           | 135° hatch of `--pd-heat-0`                  | same                                     | days without data (`missing: 'absent'`) |

Shared components (`libs/web/core/src/lib/ui/`): `pd-status-bar` (Tier 1, one input: a
`SystemSummary`), `pd-health-ring`, `pd-heat-strip`, `pd-signal-row` (label, element by unit,
value, delta), `pd-drill-sheet` (side sheet on desktop, bottom sheet on the phone),
`pd-quick-actions` (the three-tab overlay), and a forecast mode for the existing
`sparkline.component.ts` (already planned in round 1).

## 5. Rollout (each step a small PR that ships alone)

1. **Tier 1 data.** `GET /api/system/summary` in `@pd/client-core` + `libs/shared/contracts`:
   alerts (from the log, jobs and integrations), MCP last call (`lastUsedAt`), bot state and
   delivery, backup (`BackupStatus`), sync, and the health score with its reasons. No UI yet.
2. **`pd-status-bar` + `pd-drill-sheet`** on the home (A1 placement). This alone answers
   "is everything all right?" on every visit.
3. **Quick actions overlay** wired to Ctrl+K commands (`>` расход, `>` заметка). Transaction
   reuses the Finance dialog; note routes through the capture commands; restart is hidden until
   step 7.
4. **Home layout** of the chosen variant (A1, A2 or A3) on top of the existing widget editor;
   the briefing card from `morning_digest_snapshots`, locked on top.
5. **Inner pages**: Finance (A1) — month picker instead of tabs, folds; Tasks (A3) — three views.
6. **Telemetry overview (C1)** reading Links' daily metrics and the device / integration
   freshness that already exist; C2 as its "all signals" link.
7. **Server vitals and containers (new).** A small host agent or the Docker socket read-only:
   CPU, RAM, disk samples every 5 min (30 days, like `activity_health`), container state; then
   restart for `app`, `languagetool`, `ollama` only, with a confirmation and an audit row.
8. **Bot ping and MCP call counts (new)** — the last two Tier 1 numbers.

For every step: i18n keys in `en.json` and `ru.json`; `/verify-ui` at 1440 and 390 in both
themes; README.md (home, Ctrl+K, System); new achievements where something becomes countable
(for example, "the system stayed Healthy for 30 days"); and `docs/telemetry.md` when step 7 adds
the server collector.

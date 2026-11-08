# Proposal: Links v2 — from "what goes together" to "what it means for me"

Status: proposal (2026-10-25; the base layer, the owner's catalogue and forecasts for any number
added 2026-11-05), nothing built yet. The owner's ideas and the assistant's, in one
plan; the owner's decisions are at the end. Health diagnoses of the owner never go into this file.

## What there is now (v1)

Every signal collected, with its daily numbers, is listed in [../telemetry.md](../telemetry.md).

Life → Links, in the core (`libs/api/core/src/lib/links/`) with the page in
`libs/modules/life/web/src/lib/links/`:

- **Daily numbers from every section** (`registerDailyMetrics`): screen time, games, late games,
  focus, sites, first and last use, desktop telemetry (context switches, input, terminal errors,
  reading, build waits), phone unlocks and night, places (km, places, on foot, on the way, at
  home, new places), commits and coding time, tasks created and done, spending, diary words and
  mood, habits, music plays, Steam and Dota, lab values, questionnaires, AI messages, downtime.
- **Correlations** (`correlations/correlations.ts`): every number against every other, of the same
  day and of the next; the season of each number taken away (±14 days), p-values that allow for
  the days' own trends (effective days, Bartlett), the Benjamini–Hochberg correction across all
  pairs, a next-day link kept only when it holds beyond that day's own yesterday; a regression of
  a chosen number on up to six others.
- **The page**: the strongest links, a graph, a pair with its scatter, the regression, a matrix
  (heatmap) of all pairs, before/after an event, the mood forecast (a ridge model, shown only
  when it beats the plain guess on held-out days) and what goes with good and bad days.
- **Moments and periods** from the sections (an event, a medication taken for weeks) for the
  before/after view.

What v1 cannot do: it sees only whole days (not "the hour after a burst of notifications"),
only pairs and straight lines (not "up to 8 000 steps it helps, then nothing"), no number made of
several sections (an index), no personal baseline ("unusual for me"), no warning ahead, and the
findings are tables, not sentences.

## Principles (kept from v1, written down)

- **It describes, it does not prove.** Every card says what was seen, on how many days, how sure;
  "may", never "causes". No medical or psychological conclusions, no diagnoses.
- **Missing is not zero.** A day a source did not report is absent (`missing: 'absent'`), never 0.
- **Personal, not population.** Every threshold is the user's own (their baseline), not a norm.
- **The AI only words what was computed.** Numbers and verdicts come from the engine; the AI
  turns them into a sentence and may not add a number of its own (checked: every number in the
  text must be one of the facts given).
- **Gentle by default.** Warnings respect the gentle mode and the quiet hours; nothing that would
  shame ("you wasted 4 h"). A warning can be switched off per kind.
- **Private.** Everything is computed on the user's server; an outside AI gets aggregates, never
  raw notifications, places or diary text.

## 1. New numbers: indices made of several signals

Each is a daily number registered like the others, so every v1 view gets it for free. The ones
from one section are computed by that section; the ones across sections by the core from the
sections' numbers (modules never read each other).

| Index                                      | How it is counted                                                                                                                               | Needs                                           |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| **Phone restlessness** ("digital anxiety") | unlocks per hour of phone use, and the share of sessions under 30 s (unlock → nothing → lock); against the user's 28-day median                 | unlocks, spans (have)                           |
| **Phone app switching**                    | switches between apps per hour of use, on the phone (the desktop has `contextSwitches`)                                                         | spans (have)                                    |
| **Context switching cost**                 | switches per hour during work hours ÷ tasks done that day; and the minutes after a switch to social/messengers before the next coding span      | desktop telemetry, spans, tasks (have)          |
| **Deep work**                              | blocks of 25+ min in one work app (IDE, terminal, docs) without a switch or a notification; minutes a day, the longest block                    | spans, notifications (have)                     |
| **Nourishing vs draining time**            | the share of the day's screen time in work/learning/creating categories against short-video, social, endless feeds; per day and per week        | app categories (have; to be refined, see below) |
| **Interruptions in focus**                 | notifications during focus sessions and coding hours, per hour; which apps                                                                      | notifications, focus, coding hours (have)       |
| **Late-night load**                        | phone after 23:00 + late games + last use; one number of "the night ate into sleep"                                                             | have                                            |
| **Time outside / movement**                | hours away from home, on foot, new places (have since 2d)                                                                                       | have                                            |
| **Recovery**                               | after a bad day (mood ≤ 2 or a heavy-load day): days until the numbers are back to the baseline                                                 | mood, baseline                                  |
| **Sleep** (stage 3)                        | duration, regularity (bedtime spread), deep/REM share, HRV, resting pulse; **our stress index** from HRV and resting pulse against the baseline | the band                                        |

App categories need care: "YouTube" can be a lecture or Shorts. The phone gives the app only, the
browser extension gives the site; a user override per app/site (exists for the desktop) is the
answer, plus a third category "it depends" that is not counted either way.

**Learned draining score** (the owner wants the number to find it by itself): for each app, what
the hour after it looks like against the user's same hours without it — focus and deep work in
the next hour, the number of unlocks, coding minutes — and, by day, its time against the mood and
tasks done. An app that keeps being followed by worse hours is "draining for you", one followed by
better ones "nourishing"; shown with how sure it is, never decided on a handful of days. The
starting list until there are enough days: **Instagram and TikTok** draining (the owner's), IDEs,
terminals, docs nourishing.

## 2. Hours, not only days

v1 lives on days; many questions are about hours ("notifications break the flow"). v2 adds:

- **Hourly series** (`registerHourlyMetrics`, a new registry next to the daily one): notifications,
  unlocks, phone use, coding minutes, commits, focus, music plays, steps (stage 3), places.
- **The hour after an event**: what coding/focus does in the hour after a burst of notifications
  (≥ N in 10 min), after opening a social app, after a meeting — compared with the user's same hours
  without it (matched by weekday and hour, to keep the daily rhythm out).
- **The day's rhythm**: a profile of each number by hour and weekday — "your coding peaks 10–12
  and 21–23", "notifications peak at 14".
- **The productive window** (the owner's idea): the hours when coding/focus/tasks done are highest
  for this user, by weekday, with how sure it is; offered to Tasks ("hard tasks best at 10–12").

## 3. Richer links

- **Lags beyond one day** — 2–3 days: sleep, alcohol (habits), heavy load often show later.
- **Not only straight lines (dose–response)**: the number split into its own quantiles, the other
  number's average in each — "mood rises with walking up to ~40 min, then flat". Shown as a small
  chart, not a coefficient.
- **Interactions**: does A matter only when B? ("late phone hurts the next day's focus only after a
  short sleep"). Few, chosen pairs only — every extra test is a chance for a false finding.
- **Confounders named**: weather (have), weekends (have), illness periods (Health), travel (places:
  far from home), holidays; a link that disappears when one of them is held fixed is shown as such.
- **Change points**: "since about 12 September your late-night phone is up by 40 minutes" — when a
  number's level changed, found by a simple two-segment test, and what else changed around then.
- **Your hypotheses** (the owner's), each as a ready "question" card that the engine answers with
  the data there is, and says "not enough days yet" otherwise:
  - restless phone days, late social apps, low energy → **impulse spending** — postponed: there
    is no sound way to tell an impulse purchase yet (the owner's decision);
  - notifications in coding hours → **the first commit's hour, coding minutes, deep work**;
  - **time away from home** (café, coworking, trips) → tasks done, mood;
  - **music** (artists, genres from Last.fm tags) → deep work blocks that follow it;
  - evening phone after midnight → **a habit missed the next day**.

## 4. Looking ahead

All models are the user's own, small and explainable (ridge / logistic regression on a handful of
the user's numbers), retrained nightly, and **shown only when they beat the plain guess on the
user's held-out recent days** (as the mood forecast does now). Each says what drove it.

- **Overload early warning** (the owner's "burnout forecast" — named "overload" on purpose: it is
  not a diagnosis): a score from the last 3–5 days against the baseline — night phone up, sleep
  down (stage 3), short messenger bursts up, deep work and commits down, mood down. Above the
  user's own threshold: one gentle message (Telegram, push and a desktop notification) with what
  drove it and one small
  suggestion; at most once in a few days; off in the gentle mode's quiet hours; switchable.
- **Habit lapse risk** (the owner's idea): the chance a habit is missed tomorrow from tonight's
  numbers (phone after midnight, late games, mood); a gentle evening nudge, not a scolding.
- **Tomorrow's productive window** and **tomorrow's mood** (exists) side by side in the morning
  digest.

## 4a. With the band (stage 3, from the roadmap's "bio-productivity")

- **Task stress cost**: HRV and pulse during meetings, deep coding, games — which work costs the
  most (needs the band's minute-level HRV/pulse and the hourly series).
- **Sleep → the day's coding capacity**: deep/REM sleep against the next day's deep work and
  commits; the morning digest says "a lighter day fits today".
- **Overnight energy ROI**: work past midnight against the next day's output and recovery.
- **Active breaks in natural pauses**: a movement nudge after a long still stretch, sent when the
  flow breaks anyway (a commit, a test run, a build wait).

## 5. How it looks

- **Insight cards** (the owner's): "On days you unlock the phone more than 80 times, your evening
  mood is about 0.6 lower (of 5) — seen on 34 of 120 days, fairly sure". Built from the engine's
  facts; the AI words them; each card opens the evidence (the scatter, the days).
- **Actions × outcomes matrix** (the owner's): the existing matrix split into what you do (phone,
  games, spending, walking, music, coding) and what you get (mood, tasks done, sleep, focus).
- **"Unusual today"**: the numbers far from the baseline today, calmly ("more notifications than
  on 9 of 10 days").
- **"What made today"**: for the mood forecast and the overload score, the contribution of each
  number (from the model's weights), so a day can be read, not only scored.
- **Experiments**: a link worth checking becomes a personal experiment (see
  [personal-lab.md](personal-lab.md)) — the honest way from "goes together" to "helps me".

## 6. Data quality

- A coverage line for every number (on how many days it was seen) and for every finding.
- Device changes (a new phone), long gaps, travel marked; a number that changed its source is not
  compared across the change.
- A minimum of days per finding (v1: 14; indices and hours: their own minimums), and "not enough
  days yet — about N more" instead of a verdict.

## 7. Everything collected becomes a number (the base layer)

The owner's rule (2026-11-05): **Links v2 counts every signal the dashboard has**, not a chosen
few. v1 has ~100 daily numbers ([../telemetry.md](../telemetry.md#every-daily-number-links-has));
"Kept but not in Links yet" there lists what is stored and not counted. Each of these becomes a
daily number registered by its own section (no new collection needed):

| Section          | New daily numbers                                                                                                                                                                                                                                |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Phone            | notifications (all, and per category: messengers, social, work, other); the busiest 10 minutes of notifications; time per app category (social, short video, messengers, games, work, reading); app switches; sessions under 30 s; silent ringer |
| Places           | hours per kind of place (home, work, café, gym, nature…); trips by mode (on foot, car, transport)                                                                                                                                                |
| Band             | average and highest heart rate; minutes awake in the night; distance                                                                                                                                                                             |
| Computer         | focus sessions broken / finished; limits reached; hours per work context; CPU over 90 % (hours)                                                                                                                                                  |
| Telemetry        | unique apps; focus entropy; typing pauses; page types read (article, tech article, video, course)                                                                                                                                                |
| Development      | coding hours per project and per language (the 5 most frequent of the period)                                                                                                                                                                    |
| Games and music  | hours per game (Steam top 5, WoW); Dota K/D/A and party; SoundCloud plays                                                                                                                                                                        |
| Finance          | income; spending after 22:00; net worth (weekly)                                                                                                                                                                                                 |
| Diary            | **tags** (each of the 10 most used as a yes/no day — "sport", "friends"…); photos                                                                                                                                                                |
| Tasks and habits | overdue tasks; open tasks without a date; high-priority tasks done; habit **amounts** where a habit has them                                                                                                                                     |
| AI               | tokens                                                                                                                                                                                                                                           |

**Built 2026-11-05** (listed in [../telemetry.md](../telemetry.md#every-daily-number-links-has)):
diary tags and the mood's spread; open loops, overdue, due-done share, important done; phone hours
and per category, notifications, of messengers, the busiest ten minutes; bike and ride, hours at
each named place; focus sessions finished and distracted minutes; telemetry's unique apps, focus
entropy, typing pauses; the band's heart rate, awake time, distance; coding per project and
language; Steam per game; income; AI tokens. Habits already counted their amounts.

**Not yet:** hours per _kind_ of place (needs each stay matched to its looked-up name); phone app
switches and short sessions (they are stage 1's restlessness and app switching); silent ringer;
limits reached, work contexts, CPU over 90 %; page types read; Dota K/D/A and party, WoW;
SoundCloud plays; net worth; diary photos. **Spending after 22:00 cannot be counted:** a
transaction keeps only its date (bank imports have no time) — catalogue's 77 waits for that.

## 8. Main and extra numbers (the filter)

Every number is counted and stored from its first day (so its history is there when it is
wanted), but not every number is shown:

- **Main** — shown by default and searched by default: the ones a person reads about their day.
- **Extra** — counted, hidden by default; the filter on the Links page switches them on one by one
  or by group ("+ the computer's extra numbers"); the choice is remembered. Everything marked
  _extra_ below, and the new numbers that are mostly technical (CPU, tokens, typing pauses, silent
  ringer, net worth, SoundCloud).

**Why extra numbers are also left out of the search, not only out of sight:** every pair tested
makes the Benjamini–Hochberg correction stricter. ~100 numbers make ~10 000 tests (same and next
day); ~230 would make ~50 000 and real links of the main numbers would stop passing. So the search
runs on what is switched on, and v2 searches **actions × outcomes** by default (section 5's
matrix: what you do against mood, tasks done, sleep, focus, deep work, coding), all × all only on
request.

**Who reads the extra numbers:** the Links search only when switched on; the good/bad mood
days and the forecast never; before/after always (a technical reading around a medication's start
matters). The number a regression explains is searched like an outcome, whatever it is.

**A number made of others is never paired with its own parts** ("deep work share" against "focus
hours" is arithmetic, not a finding): each derived number names its parents and the engine skips
those pairs.

## 9. The owner's catalogue — what is taken

[telemetry_metrics_catalogue.md](telemetry_metrics_catalogue.md) (140 ideas, 2026-11-05) is an
addition, not the base. Each idea was checked against what there is. Numbers are the catalogue's.

**Rules used:** no duplicates (an idea already in v1 or v2 goes to that number); no number with
made-up weights (the catalogue's `0.4·Sleep − 0.05·Latency` — v2 learns the weights from the
owner's days); a link between two numbers is not a number (the engine finds it); "biomarker"
names are not used (no diagnoses).

### Taken as main numbers (new)

| #        | Idea                        | In v2                                                                                                    |
| -------- | --------------------------- | -------------------------------------------------------------------------------------------------------- |
| 10       | First action latency        | minutes from the first unlock to the first work span (IDE, terminal, coding)                             |
| 11       | Task velocity               | tasks done of those due today, %                                                                         |
| 21, 136  | Morning doomscrolling       | minutes in draining apps in the 2 h after the first unlock; the month view shows "mornings without them" |
| 33       | Sleep window variance       | bedtime spread over 7 days — from the band, and from the phone's last use when there is no band          |
| 80, 120  | Data completeness           | the day's coverage: sources that reported of those connected, % (section 6 as a number)                  |
| 90, 127  | Offline time                | the longest daytime stretch with no screen on any device                                                 |
| 104, 118 | Notification storm          | the busiest 10 minutes of notifications; messenger notifications per day                                 |
| 121      | Desktop restlessness        | window switches after less than 60 s, per hour — the computer's twin of phone restlessness               |
| 123      | Entertainment after bedtime | of the late-night load, the part in draining apps and video after the owner's usual bedtime              |
| 135      | Mood volatility             | the spread of the diary's mood over 14 days                                                              |
| 138, 63  | Open loops                  | open tasks without a date + overdue tasks                                                                |

### Taken as extra numbers (hidden by default)

| #   | Idea                        | In v2                                                         |
| --- | --------------------------- | ------------------------------------------------------------- |
| 8   | Media share                 | video and films of the day's screen time, %                   |
| 12  | Bot prompt answers          | the dashboard's questions answered (doses, mood, check-ins) % |
| 14  | Commit density by hour      | in the hourly series; lines changed when the sync has them    |
| 18  | App switch fatigue          | the most unique apps in one hour                              |
| 19  | Gaming limit kept           | games time against the Activity limit                         |
| 20  | Terminal share              | terminal time of the computer's work time                     |
| 35  | AI tokens                   | per day                                                       |
| 58  | Time among people           | hours in cafés, offices, events (place kinds), calls, people  |
| 76  | Computer at its limit       | hours with CPU or memory over 90 %                            |
| 77  | Late food orders            | food and delivery spending after 21:00                        |
| 86  | Awake after dark            | screen hours after sunset (weather gives sunset)              |
| 93  | Binge depth                 | the most episodes in a row                                    |
| 102 | All habits day              | a day with every habit done                                   |
| 115 | Code–life balance           | coding hours against walking and offline time                 |
| 124 | Screen alone vs with people | screen hours against call minutes and time among people       |
| 128 | Diary tone                  | later: needs a local model (the server fits only embeddings)  |
| 137 | Work–recovery balance       | deep work against sleep and offline time                      |

### Duplicates (go to the existing number, nothing new)

1 deep work (v2 adds the share) · 2, 117 late-night load · 3, 122 phone restlessness · 4 context
switching · 5, 17, 109 `notificationsOpened`, `secondsToOpen` · 6 `places.km` · 16, 105 the
baseline of every number ("unusual today") · 26, 85, 59 deep work blocks · 27, 51 the day's rhythm
· 28 `music.plays`, `phone.media` · 31 `terminalCommands` · 36, 91 `places.count`, `newPlaces` ·
39 `diary.words` · 41, 134, 69 the overload warning · 42 the mood forecast · 46, 60, 71 habit
lapse risk (the diary as a habit) · 65, 116 weather is already in every search (116 repeats 65) ·
78, 125 `backspacePercent` · 96 `phone.dnd` · 101 the inverse of `activity.hours` · 139 a link the
engine finds (people × mood), not a number.

### Not Links — another section

| #                                              | Where                                                                                                                 |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| 9, 29, 30, 37, 38, 40, 48, 55, 70, 79, 89, 106 | System: backups, disk, updates, jobs, security level, AI quota — the redesign's System page                           |
| 13                                             | AI page: local vs outside requests                                                                                    |
| 24, 68                                         | Security / the vault                                                                                                  |
| 7, 57                                          | Finance: spending against the budget (budgets exist), the month's cash flow                                           |
| 56                                             | Projects / Tasks: deadline drift                                                                                      |
| 129–133                                        | Psychology: an optional evening check-in (energy, calm, control, meaning, body); its answers come to Links as numbers |
| 45                                             | postponed by the owner (impulse spending)                                                                             |

### Proposed to drop — the owner decides

Nothing to measure them with, or no meaning for one person's days; any of them can come back as an
extra number:

- **No data and no honest way to get it:** 52 weight from food receipts, 64 simulation ETA, 84
  genealogy, 126 unanswered messages (the dashboard cannot see replies), 62 backups × streaming,
  72 network drops, 67 wanderlust trigger.
- **Made-up composites** (v2 learns its own): 81 digital entropy, 98 physical energy footprint,
  100 code-to-coffee, 111 serenity index, 140 resilience score (the band has its own), 82 XP (the
  level exists).
- **About the dashboard, not the owner:** 73 module usage, 87 sovereignty, 88 and 103 recall
  counts, 94 Telegram share, 95 active domains, 97 vault entropy, 99 digest rating, 112 links
  density, 113 dev containers uptime, 114 automation time saved, 119 file longevity.
- **Needs new collection for little meaning:** 22 traffic while idle, 25 shortcuts vs clicks, 34
  clipboard, 107 clean working tree, 108 prompt length, 110 knowledge base size.
- **Development page, not life:** 66 tech debt, 74 CI failure risk, 75 repo size, 92 deletions
  vs additions.
- **Overlaps a taken one:** 23 quick captures (tasks created), 32 inbox processed, 43, 49
  short-term distraction risks (come from section 2's "hour after an event"), 53 notification
  fatigue (the gentle mode decides).

The catalogue's forecasts 44 bedtime, 47 today's tasks, 50 morning deep work, 54 the weekend and
61 morning recovery are **not dropped**: they become targets of section 10's forecaster.

## 10. Forecasts for any number

v1 forecasts only tomorrow's mood. v2 makes the same model (ridge on the owner's numbers,
retrained nightly) for **any main number** the owner picks: tomorrow's deep work, coding hours,
tasks done, bedtime, sleep, steps, spending, mood, the overload score. The catalogue's section 2
becomes targets of this one forecaster, not formulas of their own.

- Shown **only when it beats the plain guess** (the same weekday's average, and yesterday) on the
  owner's held-out recent days, with how much better ("bedtime within ±25 min, 30 % closer than
  the plain guess"); a target that does not beat it says so and is not shown on Home.
- Each forecast says **what drove it** (section 5's "what made today").
- Later, with the hourly series: **today's forecast by noon** (the rest of the day from its
  morning) — "a light afternoon fits today".
- Forecasts go to the morning digest and Home only for the targets the owner chose.

## Order

0. **The base layer and the filter** (sections 7–8): every collected signal as a daily number,
   main and extra, the actions × outcomes search, derived numbers kept away from their parts.
1. **Indices of the phone and the desktop** (restlessness, app switching, deep work, nourishing vs
   draining, interruptions in focus, late-night load) + coverage lines + the catalogue's main
   numbers (section 9). Little new data, much new meaning.
2. **Baselines and "unusual today"**, change points, dose–response, 2–3-day lags.
3. **Hourly series**: the hour after an event, the day's rhythm, the productive window.
4. **The owner's hypotheses as question cards**, insight cards worded by the AI.
5. **Forecasts** for any main number (section 10), the overload warning, habit lapse risk — the
   simple ones right after stage 2, the rest after stage 3 (sleep and
   the stress index make them much better).
6. **Experiments** (personal-lab).

## Decisions (2026-10-25, the owner's)

- **Draining apps:** Instagram and TikTok to start with; in the end the number should find them by
  itself — see "Learned draining score" in section 1.
- **Impulse spending:** not now — there is no sound way to tell an impulse purchase yet; the
  hypothesis waits.
- **The overload warning:** Telegram, push and the desktop app's own notifications (desktop
  notifications are built right after Xbox, see the roadmap).
- **The AI** may get the aggregates for the insight cards (numbers, names of apps and categories;
  still no texts and no places).

## Decisions (2026-11-05, the owner's)

- **The base:** Links v2 counts every signal the dashboard has (section 7); the catalogue is an
  addition (section 9).
- **Main and extra numbers:** yes, extra ones hidden by default and switched on in the filter
  (section 8).
- **The catalogue's drop list:** dropped as proposed.
- **An evening check-in in Psychology:** yes — **energy** and **anxiety** to start with, more
  questions later; the answers come to Links as numbers (outcomes).
- **The check-in lives in the Diary** (2026-11-06, the owner's): asked together with the diary's
  evening question — the mood, then energy, then anxiety (1–5 each, Telegram buttons), then a few
  words — and kept in the day's entry (`diary_entries.energy`, `anxiety`); `diary.energy` and
  `diary.anxiety` are outcomes of Links.
- **The first forecasts:** bedtime, tomorrow's deep work, tasks done, mood.
- **Start with stage 0**, then stage 1.

## Decisions for stage 1 (2026-11-06, the owner's)

- **Draining to start with:** Instagram, TikTok, YouTube Shorts and Reels, the feeds of VK,
  Reddit, X and Facebook (on the phone and in the browser); the rest "it depends" until the
  learned score knows better.
- **Deep work:** 25 minutes without a switch or a notification; the day's longest block too.
- **"After bedtime":** the owner's usual bedtime — the median of the last 28 days (the band's
  sleep, else the phone's last use); the late-night load stays from 23:00.
- **Shown:** in Links, a card in Activity (today and 7 days against the owner's norm), a widget
  on Home, the evening summary and the assistant's tools.
- **Steps of tasks and long tasks stay in the open loops** — a long task that does not move may be
  the very thing to notice.

## Decisions for stage 2 (2026-11-06, the owner's)

- **The baseline:** the last 28 days; a number that differs by weekday (weekends unlike weekdays)
  is compared with the same weekdays of the last eight weeks instead.
- **"Unusual":** further than on 9 of 10 days of the baseline (above its 90th percentile or below
  its 10th). Today is not over: its numbers are "unusual" only upwards (a sum can still grow);
  yesterday both ways.
- **Which numbers:** all, the extra ones too.
- **Shown:** a block on the Links page, a Home widget, a line in the evening summary, the
  assistant's tools. **No judgement**: "more than on 9 of 10 days", an arrow, no good/bad colours.
- **Change points:** over the whole history, found by a nightly server job and kept (a derived
  table, like the indices); a "What changed" block on Links (the fresh ones first, the whole
  history on a button) with what else changed around then, the assistant's tools, and **one calm
  Telegram message about a fresh change of a main number, at most once a week**.
- **Dose–response:** a small chart in the card of any pair (the first number in five groups of
  its own days, the second's average in each), and a search for links that are not straight
  lines ("up, then flat"), corrected for the number of pairs like the rest.
- **Lags of 2–3 days:** to the outcomes only (what a day gives), in the same correction.
- **Forecasts:** a stage of their own, right after this one.
- **Achievements:** for exploring — change points and dose charts opened, and "an even day" (no
  number unusual); never for the numbers themselves.

**Built (2026-11-06):** all of the above, changed after the team review by the owner's word: the
fresh changes are told in the **Monday morning digest** (its AI names the numbers by their
keys), not in a message of their own; the history searched is three years; of one pair a day,
two and three days later only the strongest lag counts as a link. The evening summary says how
many numbers are above usual (the server has no translations of the numbers' names).

## Decisions for the forecasts (2026-11-06/07, the owner's)

- **The bedtime:** the band's start of sleep, else the phone's last use of the evening.
- **The targets:** bedtime, deep work, tasks done and mood by default; any main number may be
  added in Links (`links_settings`, at most 12 more).
- **When:** in the morning for the day (from yesterday) and in the evening for the next day —
  both. The evening's reads yesterday too (after the team review: today is not over, its sums
  still grow and its bedtime has not come), by a model learnt two days ahead, so it is rougher
  and trusted only as far as that is right.
- **Kept:** yes, every forecast made, in `links_forecasts` — to show "forecast 2 h, was 2.5 h" and
  the real accuracy, and one day to teach a model of the owner's own.
- **Shown:** a card on Links (one that does not beat the plain guess grey), a Home widget (the
  trusted ones only), the morning digest, the evening summary (the four default targets: the
  server has no translations of the others), the assistant's `core_forecasts`; the old mood
  forecast (Life → Summary, `core_mood_forecast`) is folded into it.
- **The plain guess:** the best of the number yesterday, on the same weekdays of eight weeks and
  over the week; the forecast is trusted when its miss on the latest fifth of the days is 5 %
  smaller.
- **Achievements:** for exploring only — what drove a forecast opened, and a target of one's own.

- **Hidden sections:** what the AI must not see stays out of the forecasts it gets — of the
  bedtime when Health or Activity is hidden, and of what drove any forecast.

**Built (2026-11-07):** all of the above.

## Decisions for the hours (2026-11-07, the owner's)

- **All of section 2 at once:** the hourly registry, the day's rhythm, the hour after an event
  and the productive window.
- **The events:** a burst of notifications (beyond nine of ten of the user's own busiest ten
  minutes, 4 at least), a game, a draining app opened, a meeting, a long phone session (20+
  minutes), a walk (1500+ steps in an hour), music started (after an hour of quiet), the end of
  a focus session, leaving home — "as many as there can be". The hour after is the next clock
  hour, against the same weekday's same hours without the event the hour before; a pair is told
  when it survives the correction for the number of pairs and is a fifth of the number's own
  spread or more.
- **Productive:** coding minutes, deep work minutes and tasks done, each against its own usual
  hour; the window — the weekday's best hours (60 % of its best and 1.5× its average, two runs at
  most), with how sure.
- **The period:** the last 90 days (the rhythm can be read over 30, 90 or 365).
- **Shown:** Links (the rhythm, the hour after, the window), Tasks (today's window over the list,
  the due day's weekday in the form), the morning digest, a Home widget and the assistant's
  tools. No reminder before the window.
- **Achievements:** for exploring (rhythms and hours after opened) and "in my window" — a day
  whose deep work went mostly into its weekday's window, kept by a nightly job.
- **Kept:** the tracker's hours in `activity_hour_values` (derived, counted with the day's
  indices, a year back); the other sections' hours are read from their own tables.
- **After the team review:** the days counted before the hours get their hours only (their
  indices stay, so the changes and the forecasts found from them do not move); an hour is 60
  minutes at most even when the clocks go back; looking at a rhythm counts when a number is
  chosen, not when the page opens; the rhythm opens on deep work or coding.

**Built (2026-11-07):** all of the above.

## Decisions for the questions and insights (2026-11-07, the owner's)

- **Built-in questions:** notifications in coding hours → deep work and coding minutes; time at
  home → tasks done and mood; music started → deep work in the hour after; phone at night → each
  habit the next day (five at most). Impulse spending still waits.
- **Own questions:** picked from the numbers ("A → B", the same day, the next day or the hour
  after an event, optionally "only when C is high or low"), or asked in words — the AI turns them
  into such a card from the names of the numbers only, shown to check before it is kept. Thirty
  at most.
- **The answer:** the days of more of the cause (above its own middle) against the rest, the
  effect in each, Welch's test; told when p < 0.05 and the difference is a fifth of the effect's
  spread; 20 days at least. The hour after reuses stage 3's comparison.
- **Confounders, for every card and finding:** whether the difference holds within weekdays and
  weekends, dry and rainy days, days ill (a diagnosis that ended within 30 days) and well, days
  away (under two hours at home) and at home — "holds" or "may be explained by".
- **Insight cards:** every Monday (and now on a button, at most once an hour) the strongest of
  the links of the last 180 days (each checked as a card), the hour after an event, fresh
  changes and answered questions, eight at most; the AI words them from keys and numbers only, the
  page words them by a template without one; kept for the week. A sync client makes none.
- **Shown:** both at the top of Links, "the insight of the day" on Home, the Monday digest, the
  assistant's `core_insights`.
- **Achievements:** the proof of findings opened, and questions of one's own.
- **After the team review:** a finding names the outcome as the effect, and a pair is told once
  (not again as an answered question, nor the other way round); a built-in card of numbers the
  user does not have is not shown; a finding keeps a key of what it is about, so its proof
  opened counts once however often the week is looked at again; the week is made on the user's
  own Monday morning (an hourly job; the Monday digest makes it if it is not there yet), one at a
  time (a lock), and the button looks at most once an hour even when nothing is found; on a sync
  client the button and the question in words run on the server; the AI gets diary tags unnamed;
  a refusal comes as a reason the page tells in its language (the AI's own words only when it
  gave them); the findings are derived — not exported, not in the trash.

**Built (2026-11-07):** all of the above.

## Decisions for the overload and the lapses (2026-11-08, the owner's)

- **The overload score:** the last five days that are over against the four weeks before, of the
  phone at night, a restless phone, the band's sleep, deep work, commits and the mood, each in
  its own spread (capped at three), the mean of those known (three at least).
- **High:** above nine of ten of the user's own past scores (the last 120 days but the last week),
  never below 0.75; the page says "still learning" before a month of days.
- **The warning:** one message (Telegram, the phone, the computer; the quiet hours wait) in the
  user's day hours (10–21), at most once in three days, switchable on the Links card, with what
  pulls most and one small step for it from a fixed list, in the user's language; no AI.
- **The habit lapse risk:** for a habit to quit or cut down (a marked day is a lapse) and a daily
  one (an unmarked day); tomorrow's chance from the day's numbers by a model of the user's own
  year, trusted when it beats "as often as usual"; told in the evening summary when 6 in 10 or
  more and well above the usual; shown on the habit's card.
- **Shown:** an Overload card on Links, a Home widget, the assistant's `core_overload`, the
  chance on each habit's card.
- **Achievements:** back to the usual after a warning, and a habit kept the day it was said to be
  likely to slip — never for the load itself.
- **After the team review:** the lapse model learns only from days whose next day is over (an
  unmarked habit this evening is no lapse); a lapse counts as told only once the evening summary
  that tells it is sent, and its day is looked at two days later (a lapse is often marked the day
  after); the last warning is a `links_seen` row, not a setting the user's switch shares (a sync
  would keep one and lose the other); the overload reads its four sections only and both are kept
  an hour; the warning opens Links; a chance reads 1–9 in 10, never 0 or 10.

**Built (2026-11-08):** all of the above.

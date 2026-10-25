# Proposal: Links v2 — from "what goes together" to "what it means for me"

Status: proposal (2026-10-25), nothing built yet. The owner's ideas and the assistant's, in one
plan; the open questions are at the end. Health diagnoses of the owner never go into this file.

## What there is now (v1)

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

| Index | How it is counted | Needs |
| --- | --- | --- |
| **Phone restlessness** ("digital anxiety") | unlocks per hour of phone use, and the share of sessions under 30 s (unlock → nothing → lock); against the user's 28-day median | unlocks, spans (have) |
| **Phone app switching** | switches between apps per hour of use, on the phone (the desktop has `contextSwitches`) | spans (have) |
| **Context switching cost** | switches per hour during work hours ÷ tasks done that day; and the minutes after a switch to social/messengers before the next coding span | desktop telemetry, spans, tasks (have) |
| **Deep work** | blocks of 25+ min in one work app (IDE, terminal, docs) without a switch or a notification; minutes a day, the longest block | spans, notifications (have) |
| **Nourishing vs draining time** | the share of the day's screen time in work/learning/creating categories against short-video, social, endless feeds; per day and per week | app categories (have; to be refined, see below) |
| **Interruptions in focus** | notifications during focus sessions and coding hours, per hour; which apps | notifications, focus, coding hours (have) |
| **Late-night load** | phone after 23:00 + late games + last use; one number of "the night ate into sleep" | have |
| **Time outside / movement** | hours away from home, on foot, new places (have since 2d) | have |
| **Recovery** | after a bad day (mood ≤ 2 or a heavy-load day): days until the numbers are back to the baseline | mood, baseline |
| **Sleep** (stage 3) | duration, regularity (bedtime spread), deep/REM share, HRV, resting pulse; **our stress index** from HRV and resting pulse against the baseline | the band |

App categories need care: "YouTube" can be a lecture or Shorts. The phone gives the app only, the
browser extension gives the site; a user override per app/site (exists for the desktop) is the
answer, plus a third category "it depends" that is not counted either way.

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
  - restless phone days, late social apps, low energy → **impulse spending** (the number and the
    average size of online/small unplanned purchases; "unplanned" needs a definition — see the
    questions);
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
  user's own threshold: one gentle message (Telegram or push) with what drove it and one small
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

## Order

1. **Indices of the phone and the desktop** (restlessness, app switching, deep work, nourishing vs
   draining, interruptions in focus, late-night load) + coverage lines. Little new data, much new
   meaning.
2. **Baselines and "unusual today"**, change points, dose–response, 2–3-day lags.
3. **Hourly series**: the hour after an event, the day's rhythm, the productive window.
4. **The owner's hypotheses as question cards**, insight cards worded by the AI.
5. **Forecasts**: overload warning, habit lapse risk, tomorrow's window — after stage 3 (sleep and
   the stress index make them much better).
6. **Experiments** (personal-lab).

## Open questions

- Which apps and sites are "draining" for you and which "nourishing" — start from defaults and let
  you correct, or you list them first?
- "Impulse spending": online shops only, purchases under some amount, anything not in a budget
  category you plan, or you mark them?
- The overload warning: Telegram, push, or only on the page? How often at most?
- Insight cards worded by the AI (DeepSeek now) — fine to send it the aggregates (numbers, names of
  apps and categories, no texts, no places)?

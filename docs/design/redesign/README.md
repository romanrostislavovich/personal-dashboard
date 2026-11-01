# Redesign v2 — "The Oracle"

The owner's main pain: _"too many settings, unclear filters everywhere… the overload bothers
me"_. The brief asked for density, a Bento grid, Ctrl+K and telemetry. The owner then asked for
_"something very futuristic, as if we look into the future and know the answer to every
question"_.

The approach has two layers:

1. **Structure (unchanged from v1):** one glance shows only what matters now; the rest is one
   click away (fold, "⋯", side panel). This is progressive disclosure.
2. **Visual and tone (new in v2):** an instrument from the future on a graphite base. Colour
   appears only for **status** and for **the answer**. The home briefing talks in answers and
   forecasts. Each answer shows how confident it is and a "why" link. Charts draw the future as a
   dotted line with a confidence band. Numerals are monospaced.

Mockups are self-contained HTML that opens offline. Texts are in Russian. A button in the top bar
switches between system, light and dark themes. Every mockup was checked at 1440 px and 390 px.

| File                                           | What                                                                             | v2 status                                                               |
| ---------------------------------------------- | -------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| [00-design-system.html](00-design-system.html) | graphite base, the answer colour, status, type, patterns, motion, contrast       | rewritten                                                               |
| [01-home.html](01-home.html)                   | "Ответы на сегодня" (always on top), level strip, "ask the future", pinned cards | rewritten                                                               |
| [02-shell.html](02-shell.html)                 | the menu as it is today, groups folded; phone bottom bar and "Ещё" sheet         | rewritten                                                               |
| [03-palette.html](03-palette.html)             | Ctrl+K: recent items, quick add, `>` `/` `?` modes                               | v1 layout, v2 tokens                                                    |
| [04-finance.html](04-finance.html)             | balance with a forecast, whole-month projection, six months, categories          | rewritten                                                               |
| [05-system.html](05-system.html)               | one System page: status line, vitals, problems, jobs, log                        | v1 layout, v2 tokens, plus a forecast line                              |
| [06-settings.html](06-settings.html)           | 9 tabs → 5 sections; connections as a list with a side panel                     | v1 layout, v2 tokens; the accent picker became the answer-colour picker |

v1 was overwritten: its structure lives on in v2, and its violet look is no longer wanted.

## 1. The owner's answers and what they changed

| Question            | Answer                 | Change                                                                                                                                                                                                                         |
| ------------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Accent colour       | "dark is fine"         | Graphite base from a neutral seed. Colour only for status and for the answer. The main action button is light-on-dark (dark-on-light), never coloured.                                                                         |
| Desktop menu        | "as it is now"         | The same top items (Search, Home, AI, Finance, Life) and the same five groups (Дела, Я, Работа, Досуг, Безопасность), **folded by default**. Pinned sections from v1 were dropped.                                             |
| Morning briefing    | "always"               | Always on top. It has no collapse button and never folds by time.                                                                                                                                                              |
| Level, achievements | "show them, of course" | A **level strip** next to the greeting (ring, XP bar, closest achievement), plus "Ачивки 175/504" with a level ring at the bottom of the menu. Progress motivates only when it is seen; the strip is quieter than the answers. |

The phone bottom bar stays. It holds the same four top items as the desktop menu (Home, AI,
Finance, Life) plus "Ещё", which opens the same five groups (also folded) and then Achievements,
System and Settings. This keeps "as it is now", and the most used pages become one thumb tap
instead of "☰" plus a scroll.

## 2. What the oracle answers, grounded in the project

| Answer on home                                                 | Comes from                                                                                                                                              | Status                   |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| "Всё ли в порядке?" — services down                            | integration status, the error log, uptime                                                                                                               | exists                   |
| "Каким будет настроение?" — 7/10, what lifts it, what drags it | `life` mood forecast (`mood-forecast.component.ts`); it is shown only when the model beats "like the last week", and the same honesty rule applies here | exists                   |
| "Что сделать, чтобы завтра было лучше?"                        | Links: same-day and next-day correlations, before/after                                                                                                 | exists                   |
| "Хватит ли денег до зарплаты?" — balance on the 10th           | needs a balance projection built from the 3-month average spending that the "reserve" already uses                                                      | **new**                  |
| "Ask the future" — "what if a week without Instagram?"         | AI over Links (similar weeks, before/after); short answer with confidence                                                                               | **new** (UI + prompt)    |
| Daily briefing text                                            | `ai.morning-digest` (`MorningDigestService`), which today goes to Telegram only                                                                         | exists → web card is new |
| System forecast (disk full in ~5 months)                       | needs disk usage samples                                                                                                                                | **new**                  |

Every answer shows a confidence value and a "why" link. With too little data it says "рано" and
does not guess.

## 3. Tokens

All names follow `apps/web/src/styles.scss`. The visual reference is `00-design-system.html`.

### Colour

| Token                                                                   | Dark (primary)                    | Light (secondary)                 | Notes                                                                                                       |
| ----------------------------------------------------------------------- | --------------------------------- | --------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `--mat-sys-surface`                                                     | `#0b0d10`                         | `#f4f5f7`                         | graphite; from `generatePalette(seed, neutral = true)` with surfaces tuned like `BLACK_SURFACES`            |
| `--mat-sys-surface-container-low` (= `--pd-card`)                       | `#111418`                         | `#ffffff`                         | opaque, no `backdrop-filter`                                                                                |
| `--mat-sys-surface-container-high`                                      | `#1d2228`                         | `#e7eaee`                         | inputs, icon wells                                                                                          |
| `--mat-sys-outline-variant` (= `--pd-border`)                           | `#262c33`                         | `#d9dde3`                         |                                                                                                             |
| `--mat-sys-on-surface` / `-variant`                                     | `#e8eaed` / `#a3abb6`             | `#15181c` / `#4b5563`             | 15:1 and 8:1 on cards                                                                                       |
| `--mat-sys-primary` / `on-primary`                                      | `#e6e9ee` / `#111418`             | `#15181c` / `#ffffff`             | actions are neutral                                                                                         |
| **`--pd-oracle`** (new)                                                 | `#5eead4`                         | fill `#14b8a6`, text `#0f766e`    | the answer: forecasts, insights, the level ring, the selected-item line. 12:1 on dark cards, 5.5:1 on white |
| `--pd-oracle-container`, `--pd-oracle-border`, `--pd-oracle-glow` (new) | 9 %, 32 %, ring + soft 48 px glow | 8 %, 30 %, ring only              | only the answer card glows                                                                                  |
| `--pd-forecast-line`, `--pd-forecast-band` (new)                        | oracle, oracle 14 %               | `#0f766e`, 14 %                   | dotted future and its range                                                                                 |
| `--pd-chart-primary`, `--pd-chart-expense`                              | `#c9cfd8`, `#a3abb6`              | `#374151`, `#6b7280`              | the past is neutral                                                                                         |
| `--pd-ok/warn/crit-fill`                                                | emerald / amber / rose-500        | same                              | dots, bars                                                                                                  |
| `--pd-ok/warn/crit-text`                                                | `#34d399` / `#fbbf24` / `#fb7185` | `#047857` / `#b45309` / `#be123c` | AA as text                                                                                                  |
| `--pd-glow`, `--pd-gradient`, the radial `body` background              | retired                           | retired                           | depth comes from the answer card only                                                                       |

The user can still pick the answer colour (teal by default, sky, lavender, or none) in
Settings → Appearance. Amber and pink are left out because they would read as status colours.

### Type, spacing, shape, motion

- `--pd-font`: Inter for words; `--pd-font-heading` is also Inter (Manrope is dropped for a
  calmer, more technical look).
- **`--pd-font-mono` (new)**: `'JetBrains Mono', 'Cascadia Mono', Consolas, ui-monospace`. It is
  used for every number, for `kbd` and for the `.eyebrow` labels (11/16, uppercase, 0.12em). It
  is never used for paragraphs.
- Scale: 28/36 title · 18/26 answer · 16/24 · 14/20 · 12/16; numbers are 32/40 and 24/32 mono.
- Spacing: `--pd-space-1…12` = 4, 8, 12, 16, 24, 32, 48.
- Radius: 16 for cards, 20 for the answer card, 12 for small parts, 8 for chips.
- Motion: one pulse dot per screen (2.4 s, stopped under `prefers-reduced-motion`), 200 ms
  folds, no counting-up numbers, no typewriter effect, no glitch or flicker.

## 4. What changed from v1

- Violet accent → graphite base; colour only for status and for the answer.
- Morning briefing: a list of facts that folded after 12:00 → "Ответы на сегодня", which never
  folds. The answers are written as replies to the questions a person asks in the morning, each
  with confidence and "why", plus an "ask the future" field.
- Level: an avatar badge → a level strip on home plus a menu item with a ring.
- Menu: pinned sections and "Все разделы" → the existing groups, folded, with attention dots
  bubbling up to the group header.
- Charts: past and future look different (solid neutral line vs dotted answer-colour line with a
  band); a "today" divider.
- Finance: the hero is "Остаток и прогноз"; the side shows the spending pace and the whole-month
  projection; the six-month chart has a projected bar for the current month.
- Unchanged: all of v1's simplification — loading skeletons instead of fake zeros, folded empty
  blocks, one System page, 5 settings sections, Ctrl+K quick actions.

## 5. Rollout (each step is a small, separate PR)

1. **Tokens.** Graphite as the built-in theme: `mat.theme` with a neutral palette (or the
   neutral `generatePalette` output baked in), the new `--pd-oracle*`, `--pd-forecast-*`,
   `--pd-font-mono` and `--pd-space-*`. Remove the default glow. Keep `--pd-success` and
   `--pd-danger` as aliases. Update `theme-style.ts`: the accent picker sets `--pd-oracle`, not
   `primary`.
2. **Honest loading.** Every widget goes through `pd-resource-state` plus a `pd-skeleton` (2 of
   18 do today).
3. **Shared pieces** in `libs/web/core/src/lib/ui/`: `pd-widget-card`, `pd-answer` (question,
   answer, why, confidence), `pd-confidence`, and a forecast mode for the chart components
   (`sparkline.component.ts`, `bar-chart.component.ts`: past series, future series, band).
4. **Shell.** `shell.component.*`: groups folded by default (change the `pd.nav.folded` default),
   attention dots on group headers, Achievements with a level ring, System with a status dot,
   the phone bottom bar and the "Ещё" sheet.
5. **Home.** The level strip (from `level-card.component.ts`); the "Ответы на сегодня" card built
   from existing sources (status, mood forecast, Links, digest); then the "ask the future" field.
6. **Finance.** Header and folds from v1, then the balance projection and month projection
   (server: projection endpoint in `@pd/client-core` and `libs/shared/contracts`).
7. **System, Settings, Ctrl+K** as in v1, now on the v2 tokens.

For every step: add i18n keys to both `en.json` and `ru.json`; check the result with `/verify-ui`
at 1440 and 390 px in both themes; check `README.md` (it mentions themes and accents, Ctrl+K and
the home page); add achievements if a step adds something countable (for example, asked the
future N times).

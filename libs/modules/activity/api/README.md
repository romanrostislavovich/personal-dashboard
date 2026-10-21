# activity-api

This library was generated with [Nx](https://nx.dev).

## Running unit tests

Run `nx test activity-api` to execute the unit tests via [Vitest](https://vitest.dev/).

## Telemetry and workstates

`activity-context.schema.ts` exports `telemetryDynamics` (`telemetry_dynamics`) and
`activityWorkstates` (`activity_workstates`). Both use `(user_id, id)` primary keys, owner/time
indexes, optional verified device references, and cascading user/device deletion. Metrics are
JSON; page metadata and captures use registered `encryptedText` columns. The existing Drizzle
schema glob discovers this file; there is no module-table registry to update. Generate the
migration only after the parallel schema work has joined.

Device-token uploads: `POST /api/activity/ingest/telemetry` accepts `TelemetryIngest` (desktop
source only); `POST /api/activity/ingest/workstates` accepts `WorkstateInput`. Neither accepts
user/device IDs in the payload. All other endpoints require the ordinary user session:

| Endpoint                                              | Contract / result                              |
| ----------------------------------------------------- | ---------------------------------------------- |
| `POST /api/activity/telemetry`                        | `TelemetryIngest` (browser only) → `{ saved }` |
| `GET /api/activity/telemetry`                         | `TelemetryQuery` → `TelemetryPage`             |
| `POST /api/activity/workstates`                       | `WorkstateInput` → `Workstate`                 |
| `GET /api/activity/workstates`                        | `WorkstateQuery` → `WorkstatePage`             |
| `GET /api/activity/workstates/:id`                    | `Workstate`                                    |
| `POST /api/activity/workstates/:id/restore`           | `{}` → `WorkstateRestorePlan`                  |
| `DELETE /api/activity/{telemetry,workstates}/:id`     | Permanently delete an owned row                |
| `DELETE /api/activity/{telemetry,workstates}`         | Permanently delete the owner's history         |
| `DELETE /api/activity/{telemetry,workstates}/expired` | Prune the owner's expired history              |

Shared requests live in `@pd/client-core`: existing `telemetryApi`, plus `workstatesApi`,
`telemetryHistoryApi`, `WORKSTATE_READS`, `TELEMETRY_READS`, and `WORKSTATE_CAPTURE_PATH`.
`WorkstateInput` is `{ id, capturedAt, capture: { activeApp?, windowTitle?, projectPath?,
gitBranch?, browserUrls, note? } }`. Use stable UUIDs when retrying; existing captures are not
overwritten. A capture ID already used by another transport/device returns conflict.

Queries accept optional inclusive `from`/`to` instants, `limit` (1–100, default 50), and paired
`before`/`beforeId` cursor fields. Telemetry also filters `source`; workstates accept `search`
and `context` (app, project path or branch substring). Search scans only one bounded owner page
after decryption: **follow `nextCursor` even when `items` is empty**. Ordering is descending by
timestamp and UUID. Pass the returned cursor together with the original filters.

Retention is 30 days, enforced on reads/uploads and pruned daily at 04:45. Expired telemetry
retries are ignored; expired workstate captures are rejected. Up to one minute of future clock
skew is tolerated. Explicit deletions and retention cleanup bypass trash. Core integration
should also add `telemetry_dynamics` and `activity_workstates` to `NOT_TRASHED` in
`trash-triggers.ts` so indirect device cascades do not keep these private records in trash.

Page metadata remains optional opt-in input. Conservative shared text/URL sanitizers and the
owner's current `privateWords` are applied server-side, including again on read; this is not a
promise to detect arbitrary PII. Workstates contain no command history or key logs. Restore
only proposes confirmation-required `openUrl`, `openProject`, and `reference` actions. Branches
are references, never automatic checkouts; there are no shell commands or execution here.
Clients must validate the plan and treat paths as direct targets, never interpolate into a shell.

`activity-context.db.spec.ts` follows `sites.db.spec.ts`: set `TEST_DATABASE_URL` to a PostgreSQL
admin connection, then run `npx nx test activity-api` after migrations have been generated.
It creates an isolated temporary database and tests real migrations, encryption, ownership,
idempotency, pagination, privacy, restore proposals, and retention.

## Digital telemetry summaries

`TelemetrySummaryService` selects only numeric metrics, source and timestamps, never encrypted
page metadata. It reads owner-scoped, retained buckets in keyset pages of 1000, including buckets
that overlap the start of the requested local day. Periods use the user's current timezone.
Local midnight boundaries are converted independently to UTC: DST days need not be 24 hours.
Intervals are half-open. Totals crossing midnight are allocated by elapsed-time overlap (an
estimate, possibly fractional counts), conserving the bucket total. Future time is excluded.

Desktop and browser remain separate; simultaneous devices are summed observations, not a
deduplicated wall-clock measure. Never add these focus/reading values to legacy activity totals.
No biometric, productivity or causal interpretation is made. Missing fields/days are absent;
zero is emitted only for an explicitly measured zero. Pause variance, app counts and entropy
are deliberately not averaged: the buckets do not carry the sufficient statistics needed.

`ActivityLinks` registers the daily series; `ActivityLife` independently registers day events
and period cards even when there is no legacy tracker data. Metric IDs and card keys are
`activity.telemetry.<desktop|browser>.<name>` (event keys append `Day`):

| Name                   | Unit / aggregation                                                                    |
| ---------------------- | ------------------------------------------------------------------------------------- |
| `contextSwitches`      | Observed count, sum                                                                   |
| `inputCount`           | Input events, sum                                                                     |
| `terminalCommands`     | Command count, sum                                                                    |
| `terminalFailures`     | Failed-command count, sum                                                             |
| `focusHours`           | Observed focus seconds / 3600, sum                                                    |
| `buildWaitHours`       | Measured wait milliseconds / 3600000, sum                                             |
| `readingHours`         | Observed reading seconds / 3600, sum                                                  |
| `inputPerMinute`       | Sum input / sum measured bucket minutes (`score` unit for a numeric reading)          |
| `terminalErrorPercent` | 100 × sum failures / sum commands, paired measurements only                           |
| `backspacePercent`     | 100 × sum backspaces / sum input, paired measurements only; not a diagnosis of errors |

Zero denominators produce no ratio. Period ratios are recomputed from weighted numerators and
denominators, never averages of daily ratios. Life marks them `aggregate: 'average'` for goals.

Existing reads suffice; no new HTTP routes, shared contracts or client requests were added:

- `LinksService.dailyMetrics(userId, period)` / `dailyMetric(userId, key, period)` for charts.
- `GET /api/life/day?day=YYYY-MM-DD` → numeric-only translated `LifeEvent`s.
- `GET /api/life/summary?from=YYYY-MM-DD&to=YYYY-MM-DD` → `LifeCard`s.
- `GET /api/life/correlations?from=...&to=...` → the existing correlation result, **after the
  core missing-data integration below**.
- AI `activity_telemetry_summary`: read-only numeric period/daily values, no page metadata.
- AI `activity_workstate_recall`: read-only bounded `WorkstateQuery` search. Returns only
  `id`, `capturedAt`, sanitized `activeApp`/`note` and `nextCursor`; never URLs, paths, branch,
  window title, device identity, restore actions or execution. Current private words are applied
  by `WorkstateService`; follow cursors even through empty filtered pages.

### Required core integration before Step3 completion

The current core treats gaps in `count`/`hours` as zero. Activity now emits `missing: 'absent'`
alongside its daily metrics, but core does not yet honor it. The parent must add optional
`missing?: 'absent'` to `DailyMetric` in shared `links.ts` and preserve measured-only values
when this flag is present in both `links/daily-series.ts` (`seriesOf`, used by correlations,
forecasts and before/after) and `links/mood-insights.ts` (its independent gap handling).
Do not change physical units or classify counts as scores to work around missingness.
Until that integration, raw Links series and Life/AI summaries are correct, but quantities
with gaps must not be treated as completed correlation integration. No schema migration is needed.

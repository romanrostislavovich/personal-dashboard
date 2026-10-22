# Desktop telemetry collectors (Step 1)

- Separate opt-in, **off by default**. `settings.json` stores `telemetryConsent: null`, or an
  explicit `{ serverUrl, deviceId }` consent. Consent is not inherited by a different server or
  device; enabling/disabling a device through the shell also clears it. Main-process
  `telemetry:set-consent` accepts only a boolean from the configured dashboard's main frame.
  Step 4 exposes this through the tray and preload bridge, with native confirmation on opt-in.
- `ActivityTracker` feeds the real Windows watcher's five-second samples into `DesktopTelemetry`.
  Other OSes do not produce samples. Paused, locked, suspended, idle (including video playback),
  private, excluded, unknown and stale focus states are denied before aggregation. Private-window
  detection uses the existing window-title/private-word rules, not a claim of native browser
  incognito detection. Titles never enter the telemetry collector.
- Full one-minute buckets are schema-validated before entering a memory-only queue of at most five
  buckets. Upload attempts run on the tracker's minute timer, after five minutes have elapsed,
  using `TELEMETRY_INGEST_PATH` and the existing `Device` authorization. There is no telemetry file
  or durable outbox. Privacy transitions discard the open bucket and queue, and abort in-flight
  requests. Device/token/server changes isolate queues; old responses cannot dequeue new data.
  Already accepted server requests cannot be recalled. Shutdown discards remaining telemetry.
- `telemetry-sources.ts` starts a separate Windows PowerShell/C# helper only after consent and an
  allowed, fresh focus sample. It renews a 2.5-second lease every second. The helper independently
  checks foreground process/title exclusions and idle time, and discards counts on denial. The
  tracker stops it on pause/lock/suspend/revocation, unknown/private/excluded/idle/stale focus,
  account transitions and shutdown. EOF exits the helper; errors are retried after 30 seconds.
- `telemetry-native.cs` installs a real `WH_KEYBOARD_LL` hook. **Only Visual Studio (`devenv`)** is
  allowlisted. Each key requires the foreground PID to match the current UI Automation focused
  element, explicit `IsPassword=false`, enabled/on-screen/keyboard-focused properties, and either
  `ControlType.Edit` with an explicitly writable `ValuePattern`, or `ControlType.Document` with
  class `WpfTextView` and an explicitly writable `TextPattern`. It checks focus again before counting.
  Missing/unsupported properties, exceptions, queries taking over 50ms, other editors, terminals,
  browsers and password fields are skipped. There is **no** cached “safe field” authorization.
  The existing writing/text-capture helper is not used. Neither UIA values/names/document text nor
  characters/scan codes are read. A transient virtual-key code is classified inside the hook only;
  injected events and Ctrl/Alt/Win shortcuts are ignored, and no raw events are buffered or emitted.
- Native output contains only counters and running pause moments, at most once per second; the
  desktop merges them into its minute bucket. `inputCount` is eligible typing-key presses per minute
  (a CPM proxy, **not** produced characters: layouts, IMEs, dead keys and paste are not measured).
  Backspace is separate; a burst begins at the second consecutive backspace within one second.
  Pauses are 1–60-second gaps, assigned to the aggregate containing the later event; variance is
  population variance in ms². Buckets use delivery time: normally about one second of counts may
  cross a minute boundary; process scheduling delays can increase this timing error.
  Unknown/changed fields drop unflushed counts rather than guessing continuity. Unsupported native
  capabilities produce absent input metrics, not invented zeros.
- `context-switch.ts` counts **app** changes, sampled focus seconds and duration-weighted Shannon
  entropy in bits. App names exist only in the minute's local histogram and last safe sample;
  no names leave the process. The last app bridges bucket boundaries, never privacy transitions.
  Missing samples over ten seconds are not inferred as focus. This is sampled activity, not exact
  OS focus-event timing or a measurement of attention.
- `terminal-telemetry.ps1` defines the explicit opt-in `Invoke-PdCommand` wrapper for **one native
  executable**. It runs the command normally and forwards only `durationMs`, `exitCode`, `category`
  (`build`/`test`/`commit`/`general`), never arguments, command lines, paths, output or history.
  It does not modify profiles or install automatic shell instrumentation. The command's output and
  `$LASTEXITCODE` are preserved; telemetry failure is silent and does not turn a failed command into
  success. Reports longer than five minutes or beginning before the continuously allowed interval
  are discarded. Only `build` contributes to capped `buildWaitMs`.
- Terminal IPC uses a Windows named pipe with a protected ACL granting only the current user and
  explicitly denying network access (not an unauthenticated HTTP listener). Reads are bounded to
  512 bytes/500ms; both native and TypeScript boundaries reject extra fields and invalid numbers.
  The pipe is recreated with the helper and has no durable queue or credential file. Same-user
  processes are trusted, as with other per-user integrations; this is not a sandbox against malware
  running as the user. A category is explicitly chosen by the caller, not inferred from command text.
- Accepted exit-zero `test`/`commit` reports invoke the optional typed `ActivityTracker` constructor
  callback with `{ category, durationMs, completedAt }`. This is a **local wrapper-reported success**
  signal for Smart Break, not independent verification that a repository was committed or a
  test suite exercised assertions. Failures, rejected reports and other categories do not emit it.
  Successful terminal reports do not trigger automatic snapshots.

## Enabling the terminal wrapper

After the existing scoped telemetry consent is enabled and an allowed sample starts the helper,
the three helper assets are copied from the normal hash-verified desktop bundle to Electron's
`userData`, just like the existing window watcher. Use that installation's `userData` directory:

```powershell
. '<userData>\terminal-telemetry.ps1'
Invoke-PdCommand -Category test -FilePath 'npm.cmd' -ArgumentList @('test')
Invoke-PdCommand -Category commit -FilePath 'git.exe' -ArgumentList @('commit', '-m', 'message')
```

Dot-sourcing is per terminal session and does not itself grant desktop telemetry consent. The
generated wrapper contains only its pipe name, no server or device token. A closed privacy gate
means no listener; commands still run. Helpers are distributed by `build.mjs` through the existing
bundle manifest/update path; nothing is downloaded independently.

## Validation and limits

- `npx nx test desktop`: aggregates, input/terminal validation, helper lifecycle/stale-child isolation,
  tracker privacy gates, typed success callbacks and upload integration (OS/persistence/network mocked).
- `npx nx run desktop:test-native` on Windows: compiles the real C# helper; tests native fail-closed
  field policy and moments, strict terminal validation, actual user-only pipe ACL, real wrapper/native
  commands with successful/failed exits, and unavailable-listener behavior. No global hook is installed
  by the tests and no user profile is touched.
- `npx nx build desktop`: production typecheck and bundling, including all three helper assets.

Interactive typing in Visual Studio/password controls has **not** been validated in this session.
UIA provider correctness remains a platform trust boundary; unknown providers are denied, and some
Visual Studio versions/controls may therefore yield no counts. A blocked/slow UIA provider or Windows
removing a timed-out low-level hook can cause undercounting, never a fallback to unverified input.
The 50ms check rejects a slow result; it cannot cancel a synchronous UIA call. Privacy/focus transitions
are sampled (100ms native foreground checks, five-second tracker samples); this is not an assertion
of exact continuous foreground observation. The helper's per-key UIA gate is separate from sampling.
Server endpoint availability and end-to-end live application behavior are not proven by these tests.

## Optional Smart Break (Step 3)

- `smartBreakConsent` in desktop settings defaults to `null`. It stores a separate explicit
  `{ serverUrl, deviceId }` opt-in; telemetry consent alone never enables suggestions. Server/device
  changes clear both consents. Smart Break uses the existing consent-gated native terminal source,
  so it also requires telemetry consent and Windows activity tracking. It never enables telemetry
  implicitly. No additional data or suggestion history is uploaded or persisted.
- Main IPC `smart-break:status` returns `{ enabled, available }` (both false for an
  untrusted sender); `smart-break:set-consent(boolean)` returns whether the request was accepted.
  Both require the configured dashboard's main frame. `enabled` reflects scoped opt-in; `available`
  reflects Windows/device/telemetry prerequisites, not live helper health. Tracker methods are
  `smartBreakStatus()` and `resetSmartBreak()`; settings helper is `hasSmartBreakConsent()`.
  Step 4 adds a tray toggle and the matching preload API.
- The pure `SmartBreak` state machine needs at least **50 minutes of sampled active work**.
  Active means a fresh allowed window and OS input within the lesser of 60 seconds and the configured
  activity idle threshold. Short inactivity is not work but preserves the accumulated total;
  **five minutes of sustained OS idle** resets it. Missing samples over ten seconds, backwards clocks,
  pause, lock, suspend, private/excluded/unknown windows, consent and identity changes clear work.
  Merely showing a suggestion or entering a Pomodoro break does not pretend the user has rested.
- Only an accepted exit-zero explicit `test`/`commit` callback can suggest a break. It is dropped
  during Pomodoro focus/break phases, meetings, inactivity, or input in the preceding **two seconds**.
  There is no pending suggestion and no notification timer: a dropped transition is never replayed.
  At most one suggestion per transition, with at least **30 minutes** between suggestions; pauses
  and consent toggles do not bypass the in-memory cooldown. Restart clears all transient state.
- Notifications use the existing Electron notification path, Russian for a `ru` system locale and
  English otherwise. They offer a convenient pause, not a biometric or fatigue diagnosis. Existing
  independently configured legacy break/Pomodoro reminders are unchanged.
- Tests cover deterministic state transitions, cooldown, rest, clock changes, privacy/lifecycle gates,
  success/failure/category handling, separate consent, and ru/en text. Interactive Windows notification
  delivery is not covered by unit tests; the wrapper/native transport has its separate native suite.

## Explicit work context (Step 4)

- Tray quick actions enable/disable telemetry and Smart Break independently (both default OFF),
  capture a snapshot, choose a project folder, choose an optional IDE `.exe`, or forget both paths.
  Opt-in has a native ru/en confirmation identifying the server. Revocation is immediate even while
  another consent confirmation is open. These actions never enable each other implicitly.
- Preload matches `DesktopBridge`: `workstates.capture(): Promise<boolean>`,
  `workstates.resume(plan): Promise<{ opened, failed, canceled }>`, and `telemetry` / `smartBreak`
  each with `status(): Promise<{ enabled, available }>` and `setConsent(boolean): Promise<boolean>`.
  New IPC handlers accept only the configured HTTP(S) dashboard's main frame, rechecking after
  asynchronous confirmations. Other frames receive false/disabled/canceled results.
- Capture and resume require telemetry consent, a registered device, active tracking and a fresh
  allowed window sample. Pause, lock, suspend, private/excluded/idle/stale windows, account/server/token
  changes and consent revocation invalidate an operation. This uses the existing sampled window
  privacy rules, not an assertion of instantaneous native focus knowledge. A 250ms operation lease
  watches revocation; a request already accepted by the server cannot be recalled.
- Capture sends only the sanitized process name, optionally the explicitly selected project path
  and a simple symbolic branch from `.git/HEAD`. Titles, typed text, commands and browser tabs are
  never collected. No git process is run; detached HEADs, worktree pointer files, linked `.git`/HEAD
  paths and oversized HEAD files are skipped. Private words are checked before showing the preview.
  Native confirmation shows every captured field, including paths and the destination server.
  Cancel sends nothing. There is no background capture, durable snapshot queue or automatic retry.
- Confirmed capture posts `WorkstateInput` to shared `WORKSTATE_CAPTURE_PATH` with `Device` auth,
  no cookie credentials or redirects, and navigates to `/activity/workstates` after success.
- `workstateContext` defaults to `null`; selected `projectPath`/`idePath` remain local and are scoped
  to `{ serverUrl, deviceId }`. Server/device registration changes clear them. Only the native file
  picker can select an executable; a server restore plan cannot set it or supply command strings.
- Restore parses `workstateRestorePlanSchema` again, previews all actions and requires native
  confirmation. URLs must match the shared public HTTP(S) sanitizer (no credentials, local/IP hosts,
  query/hash, nonstandard ports or sensitive routes). Reference fields, including branch, are
  informational only: no shell, checkout, terminal execution or editor text injection.
- Project folders and IDEs must exist on a Windows fixed local drive. `lstat` checks every path
  component for links/junctions; `realpath` must agree. UNC/device/relative/traversal/network-mapped
  paths, other drive types and non-`.exe` launchers are denied. Paths are checked again after the
  preview. The fixed `workstate-drive.ps1` asset checks drive type without command interpolation;
  it is included in the normal hash-verified bundle. Other OSes fail closed.
- With a chosen IDE, restore uses `spawn(executable, [projectPath], { shell: false })`. Otherwise it
  opens the directory in File Explorer, explicitly explained in the preview; it does not claim an
  IDE was launched. `opened` means the OS accepted an open/spawn, not that an IDE finished loading.
  Cancellation can follow partial restoration; counts reflect actions already submitted to the OS.
- Per the current user constraint, Step 4 adds/changes no spec/test files. Existing desktop/native
  checks and typecheck/build are run; interactive native dialogs, IDE launch and live server capture
  still need end-to-end verification. Local same-user filesystem/process tampering is outside the
  trust model; revalidation narrows, but cannot eliminate, filesystem races before OS open/spawn.
- Diagnostics: `telemetry:diagnostics` (trusted dashboard frame only) returns
  `DesktopTelemetryDiagnostics` — the reason collection is on or off, the helper's state
  (`{"ready":…}` lines from `telemetry-native.cs`), the pending minutes, the last attempt, the last
  accepted upload and the server's HTTP status of this session. Reading it never starts a helper or
  changes consent; no device token, titles, app names, commands or paths are in it. A device,
  account or consent change erases its history; idle and privacy pauses clear buckets, not history.

import {net, powerMonitor} from 'electron';
import {TELEMETRY_INGEST_PATH, WORKSTATE_CAPTURE_PATH} from '@pd/client-core';
import {
  sanitizeTelemetryText,
  WorkstateInput,
  workstateInputSchema,
} from '@pd/contracts';
import type {DesktopTelemetryDiagnostics} from '@pd/contracts';
import {ActivityStore, TrackerConfig} from './activity-store';
import {BreakReminder} from './break-reminder';
import {FocusPhase, FocusSession, FocusStatus, FocusTimer} from './focus-timer';
import {HealthCollector, HealthSnapshot} from './health';
import {Outage, OutageWatch} from './outages';
import {Span, SpanBuilder, WindowSample} from './span-builder';
import {isMeeting, isPrivateWindow} from './window-rules';
import {SAMPLE_SECONDS, WindowWatcher} from './window-watcher';
import {DesktopTelemetry} from './telemetry';
import {InputFieldContext, SafeInputKind} from './input-dynamics';
import {TerminalCompletion} from './terminal-friction';
import {
  SuccessfulWorkEvent,
  TelemetrySources,
  TerminalReport,
} from './telemetry-sources';
import {MAX_SAMPLE_GAP_MS} from './context-switch';
import {SmartBreak} from './smart-break';
import {secureOrigin} from '../update/updater';

/** What waits is sent this often. */
const UPLOAD_MS = 60_000;
/** A film without input counts this long at most: longer, the user has fallen asleep. */
const WATCH_WITHOUT_INPUT_MS = 3 * 60 * 60 * 1000;
/** The server takes this many spans at a time (see activityIngestSchema). */
const BATCH = 500;
/** An upload that takes longer is given up: the spans wait for the next one. */
const UPLOAD_TIMEOUT_MS = 30_000;
/** And this many focus sessions. */
const FOCUS_BATCH = 50;
/** How often the state of the computer (disks, load) is taken. */
const HEALTH_MS = 5 * 60_000;
const FIRST_HEALTH_MS = 20_000;
/** A call is still on this long after its window left the front. */
const MEETING_GRACE_MS = 2 * 60_000;

/** What the tracker tells the user; the shell shows it as a system notification. */
export type TrackerNotice =
  | {kind: 'break'; minutes: number}
  | {kind: 'smart-break'}
  | {kind: 'focus-ended'; next: FocusPhase; held: number; minutes: number}
  | {kind: 'break-ended'}
  /** A call ended; `held` — notifications that waited for it. */
  | {kind: 'meeting-ended'; held: number};

export interface TrackerStatus {
  /** The system is one the tracker can watch windows on (Windows). */
  supported: boolean;
  /** This computer is registered as a device; `null` — tracking is not enabled here. */
  deviceId: string | null;
  paused: boolean;
  /** Spans recorded and not sent yet. */
  pending: number;
}

/**
 * The activity tracker of the desktop shell: every few seconds it notes which window is in
 * front, turns that into spans of time and sends them to the dashboard — the server the window
 * of the app is connected to, with the token of this device.
 *
 * Nothing is recorded while the tracker is paused, while the user is away (no input for the
 * configured minutes; a full-screen film counts for a while), for an excluded program, when
 * the screen is locked, and before tracking is enabled in the dashboard.
 *
 * Along the way it reminds to take a break, runs the focus timer (and notes what distracts
 * from it) and takes the state of the computer every few minutes — all sent with the spans.
 */
export class ActivityTracker {
  private readonly store = new ActivityStore();
  private readonly spans = new SpanBuilder();
  private readonly watcher = new WindowWatcher(sample => this.onSample(sample));
  private locked = false;
  private suspended = false;
  private telemetryRunning = false;
  private telemetryAllowed = false;
  private telemetryTimer: NodeJS.Timeout | null = null;
  private sourceTimer: NodeJS.Timeout | null = null;
  private sourceSampleAt: number | null = null;
  private sourceIdentity: string | null = null;
  private windowCollection: DesktopTelemetryDiagnostics['collection'] =
    'waiting-window';
  private smartWindowAllowed = false;
  private workstateEpoch = 0;
  private readonly smartBreak = new SmartBreak();
  private readonly sources = new TelemetrySources(
    aggregate => {
      if (this.syncSources()) this.telemetry.mergeInput(aggregate, Date.now());
    },
    report => this.onTerminalReport(report),
  );
  private readonly telemetry = new DesktopTelemetry(
    () => ({
      identity: this.telemetryIdentity(),
      consent: this.telemetryConsent() === true,
      allowed:
        this.telemetryRunning &&
        !this.suspended &&
        this.telemetryAllowed &&
        !this.locked &&
        !this.paused &&
        powerMonitor.getSystemIdleTime() < this.store.config.idleMinutes * 60,
    }),
    async (buckets, identity, signal) => {
      const server = this.serverUrl();
      const token = this.store.token;
      if (!server || !token || identity !== this.telemetryIdentity())
        return false;
      const response = await net.fetch(
        new URL(TELEMETRY_INGEST_PATH, server).href,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Device ${token}`,
          },
          body: JSON.stringify({buckets}),
          signal: AbortSignal.any([
            signal,
            AbortSignal.timeout(UPLOAD_TIMEOUT_MS),
          ]),
        },
      );
      this.telemetry.recordHttpStatus(signal, response.status);
      if (
        response.status === 401 &&
        !signal.aborted &&
        identity === this.telemetryIdentity()
      )
        this.disable();
      return response.ok;
    },
  );
  private uploading = false;
  /** The window in front, as last sampled (for the assistant's computer_front_window). */
  private front: (WindowSample & {at: number}) | null = null;
  /** A call is in front (or was a moment ago): the app keeps quiet. */
  private meetingUntil = 0;
  private readonly outages = new OutageWatch(outage =>
    this.store.enqueueOutage(outage),
  );
  private heldInMeeting = 0;
  private readonly breaks = new BreakReminder(minutes =>
    this.notice({kind: 'break', minutes}),
  );
  private readonly health = new HealthCollector();
  /** The latest state of the computer, sent with the next upload. */
  private pendingHealth: HealthSnapshot | null = null;
  readonly focus = new FocusTimer(() => this.store.config.focus, {
    session: (session: FocusSession) => this.store.enqueueFocus(session),
    phaseEnded: (ended, next, held) => {
      const settings = this.store.config.focus;
      const minutes =
        next === 'long-break'
          ? settings.longBreakMinutes
          : settings.shortBreakMinutes;
      this.notice(
        ended === 'focus'
          ? {kind: 'focus-ended', next, held, minutes}
          : {kind: 'break-ended'},
      );
    },
    changed: () => {
      // The browser extension closes the distracting sites while a work part runs: it learns
      // of one starting or ending through the server, so that is told right away.
      if (this.focusUntil() !== this.toldFocusUntil) {
        void this.upload();
      }
      this.onChange();
    },
  });
  /** The end of the work part as last told to the server; `undefined` — not told yet. */
  private toldFocusUntil: string | null | undefined = undefined;

  constructor(
    private readonly serverUrl: () => string | null,
    /** Called when the status changes — the tray menu shows it. */
    private readonly onChange: () => void,
    /** A reminder to take a break, the end of a focus part. */
    private readonly notice: (notice: TrackerNotice) => void,
    /** Separate opt-in, scoped to the registered device and server, never activity's default. */
    private readonly telemetryConsent: () => boolean = () => false,
    /** Local explicit wrapper reports only; no command, path or repository identity. */
    private readonly successfulWork: (
      event: SuccessfulWorkEvent,
    ) => void = () => undefined,
    private readonly smartBreakConsent: () => boolean = () => false,
  ) {}

  start(): void {
    this.telemetryRunning = true;
    this.telemetryTimer ??= setInterval(
      () => void this.telemetry.tick(Date.now()),
      UPLOAD_MS,
    );
    this.sourceTimer ??= setInterval(() => this.syncSources(), 1000);
    powerMonitor.on('lock-screen', () => this.setLocked(true));
    powerMonitor.on('unlock-screen', () => this.setLocked(false));
    powerMonitor.on('suspend', () => {
      this.suspended = true;
      this.close();
      this.breaks.reset();
      this.outages.forget();
    });
    powerMonitor.on('resume', () => {
      this.suspended = false;
      this.resetTelemetry();
    });
    setInterval(() => void this.upload(), UPLOAD_MS);
    setInterval(() => this.takeHealth(), HEALTH_MS);
    // The first reading soon after the start: the load needs a moment to be measured.
    setTimeout(() => this.takeHealth(), FIRST_HEALTH_MS);
    if (this.store.deviceId) {
      this.watcher.start();
    }
  }

  status(): TrackerStatus {
    return {
      supported: WindowWatcher.supported,
      deviceId: this.store.deviceId,
      paused: this.paused,
      pending: this.store.queue.length,
    };
  }

  /** The dashboard registered this computer as a device: tracking begins. */
  enable(device: {id: string; token: string}): void {
    this.resetTelemetry();
    this.store.setDevice(device);
    this.watcher.start();
    this.onChange();
  }

  /** Tracking is switched off on this computer; what was not sent is dropped with it. */
  disable(): void {
    this.watcher.stop();
    this.close();
    this.store.dequeue(this.store.queue.length);
    this.store.setDevice(null);
    this.onChange();
  }

  /** `minutes` — pause for so long; `0` — until resumed; `null` — resume. */
  pause(minutes: number | null): void {
    this.store.setPausedUntil(
      minutes === null
        ? null
        : minutes === 0
          ? 0
          : Date.now() + minutes * 60_000,
    );
    if (minutes !== null) {
      this.close();
    }
    this.onChange();
  }

  /** Before the app quits: the open span and focus part are saved and what waits is sent. */
  async stop(): Promise<void> {
    this.telemetryRunning = false;
    if (this.telemetryTimer) clearInterval(this.telemetryTimer);
    this.telemetryTimer = null;
    if (this.sourceTimer) clearInterval(this.sourceTimer);
    this.sourceTimer = null;
    this.watcher.stop();
    this.close();
    this.focus.stop();
    await this.upload();
    this.store.flush();
  }

  /** Consent changes and account/server transitions discard rather than upload pending data. */
  resetTelemetry(): void {
    this.workstateEpoch++;
    this.resetSmartBreak();
    this.smartWindowAllowed = false;
    this.telemetryAllowed = false;
    this.sourceSampleAt = null;
    this.sourceIdentity = null;
    this.windowCollection = 'waiting-window';
    this.sources.stop();
    this.telemetry.resetDiagnostics();
  }

  resetSmartBreak(): void {
    this.smartBreak.clear();
  }

  smartBreakStatus(): {enabled: boolean; available: boolean} {
    return {
      enabled: this.smartBreakConsent() === true,
      available:
        WindowWatcher.supported &&
        !!this.telemetryIdentity() &&
        this.telemetryConsent() === true,
    };
  }

  telemetryStatus(): {enabled: boolean; available: boolean} {
    return {
      enabled: this.telemetryConsent() === true,
      available: WindowWatcher.supported && !!this.telemetryIdentity(),
    };
  }

  /** A manual snapshot: never starts helpers, enables consent or includes window metadata. */
  telemetryDiagnostics(version: string | null): DesktopTelemetryDiagnostics {
    if (this.telemetryIdentity() !== this.sourceIdentity) this.resetTelemetry();
    const collection = this.telemetryCollection();
    if (collection !== 'collecting') this.sources.stop();
    return {
      deviceId: this.store.deviceId,
      version,
      supported: WindowWatcher.supported,
      registered: !!this.store.deviceId && !!this.store.token,
      serverConfigured: !!this.serverUrl(),
      telemetryConsent: this.telemetryConsent() === true,
      smartBreakConsent: this.smartBreakConsent() === true,
      collection,
      sources: this.sources.status(),
      ...this.telemetry.diagnostics(),
    };
  }

  private telemetryCollection(): DesktopTelemetryDiagnostics['collection'] {
    if (!WindowWatcher.supported) return 'unsupported';
    if (!this.store.deviceId || !this.store.token) return 'unregistered';
    if (!this.serverUrl()) return 'no-server';
    if (this.telemetryConsent() !== true) return 'consent-required';
    if (!this.telemetryRunning) return 'stopped';
    if (this.suspended) return 'suspended';
    if (this.locked) return 'locked';
    if (this.paused) return 'paused';
    if (powerMonitor.getSystemIdleTime() >= this.store.config.idleMinutes * 60)
      return 'idle';
    const now = Date.now();
    if (
      this.sourceSampleAt === null ||
      now < this.sourceSampleAt ||
      now - this.sourceSampleAt > MAX_SAMPLE_GAP_MS
    )
      return 'waiting-window';
    if (this.windowCollection !== 'collecting') return this.windowCollection;
    return this.telemetryAllowed ? 'collecting' : 'waiting-window';
  }

  /** Main-process only. Titles and browser tabs are deliberately never part of a snapshot. */
  workstatePermit(): {key: string; activeApp?: string} | null {
    const now = Date.now();
    const identity = this.telemetryIdentity();
    if (
      !identity ||
      identity !== this.sourceIdentity ||
      !this.telemetryConsent() ||
      !this.telemetryRunning ||
      !this.telemetryAllowed ||
      this.locked ||
      this.suspended ||
      this.paused ||
      this.sourceSampleAt === null ||
      now < this.sourceSampleAt ||
      now - this.sourceSampleAt > MAX_SAMPLE_GAP_MS ||
      powerMonitor.getSystemIdleTime() >= this.store.config.idleMinutes * 60
    )
      return null;
    const activeApp =
      this.front &&
      !isPrivateWindow(this.front.app, this.store.config.privateWords)
        ? (sanitizeTelemetryText(this.front.app) ?? undefined)
        : undefined;
    return {key: JSON.stringify([identity, this.workstateEpoch]), activeApp};
  }

  workstateTextAllowed(text: string): boolean {
    return (
      sanitizeTelemetryText(text) === text &&
      !isPrivateWindow(text, this.store.config.privateWords)
    );
  }

  async saveWorkstate(
    input: WorkstateInput,
    key: string,
    signal: AbortSignal,
  ): Promise<boolean> {
    const server = this.serverUrl();
    const token = this.store.token;
    const identity = this.telemetryIdentity();
    if (
      !server ||
      !token ||
      signal.aborted ||
      this.workstatePermit()?.key !== key
    )
      return false;
    try {
      // Redirects are refused here, so an http:// address goes to its https:// origin at once.
      const origin = secureOrigin(server) ?? server;
      const response = await net.fetch(
        new URL(WORKSTATE_CAPTURE_PATH, origin).href,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Device ${token}`,
          },
          body: JSON.stringify(workstateInputSchema.parse(input)),
          redirect: 'error',
          credentials: 'omit',
          signal: AbortSignal.any([
            signal,
            AbortSignal.timeout(UPLOAD_TIMEOUT_MS),
          ]),
        },
      );
      if (response.status === 401 && this.telemetryIdentity() === identity)
        this.disable();
      return (
        response.ok && !signal.aborted && this.workstatePermit()?.key === key
      );
    } catch {
      return false;
    }
  }

  private sampleSmartBreak(now: number): void {
    const idleMs = powerMonitor.getSystemIdleTime() * 1000;
    const phase = this.focus.status().phase;
    this.smartBreak.sample(now, {
      allowed:
        this.smartBreakConsent() === true &&
        this.telemetryConsent() === true &&
        !!this.telemetryIdentity() &&
        this.telemetryRunning &&
        this.smartWindowAllowed &&
        !this.locked &&
        !this.suspended &&
        !this.paused &&
        this.sourceSampleAt !== null &&
        now >= this.sourceSampleAt &&
        now - this.sourceSampleAt <= MAX_SAMPLE_GAP_MS,
      active:
        idleMs < Math.min(60_000, this.store.config.idleMinutes * 60_000) &&
        (phase === 'idle' || phase === 'focus'),
      idleMs,
      quiet: phase !== 'idle' || this.inMeeting,
    });
  }

  /** Trusted in-process observer only; never exposed to renderer IPC. */
  observeInput(kind: SafeInputKind, field: InputFieldContext): boolean {
    return this.telemetry.observeInput(kind, field, Date.now());
  }

  /** A trusted terminal integration can explicitly report status/duration, never command text. */
  reportTerminalCompletion(report: TerminalCompletion): boolean {
    return this.telemetry.reportTerminal(report, Date.now());
  }

  private syncSources(): boolean {
    const identity = this.telemetryIdentity();
    if (identity !== this.sourceIdentity) {
      this.resetTelemetry();
      this.sourceIdentity = identity;
    }
    const now = Date.now();
    this.sampleSmartBreak(now);
    const allowed =
      !!identity &&
      this.telemetryConsent() === true &&
      this.telemetryRunning &&
      this.telemetryAllowed &&
      !this.locked &&
      !this.suspended &&
      !this.paused &&
      this.sourceSampleAt !== null &&
      now >= this.sourceSampleAt &&
      now - this.sourceSampleAt <= MAX_SAMPLE_GAP_MS &&
      powerMonitor.getSystemIdleTime() < this.store.config.idleMinutes * 60;
    this.sources.update(
      allowed
        ? {
            identity,
            privateWords: this.store.config.privateWords,
            excludedApps: this.store.config.excludedApps,
            idleMs: this.store.config.idleMinutes * 60_000,
          }
        : null,
    );
    if (!allowed) this.telemetry.clear();
    return allowed;
  }

  private onTerminalReport(report: TerminalReport): void {
    if (
      !this.syncSources() ||
      !this.reportTerminalCompletion({
        durationMs: report.durationMs,
        exitCode: report.exitCode,
        kind: report.category === 'build' ? 'build' : 'command',
        context: 'public-terminal',
      })
    )
      return;
    if (
      report.exitCode === 0 &&
      (report.category === 'test' || report.category === 'commit')
    ) {
      const event: SuccessfulWorkEvent = {
        category: report.category,
        durationMs: report.durationMs,
        completedAt: Date.now(),
      };
      this.sampleSmartBreak(event.completedAt);
      if (this.smartBreak.transition(event, event.completedAt))
        this.notice({kind: 'smart-break'});
      this.successfulWork(event);
    }
  }

  private telemetryIdentity(): string | null {
    const server = this.serverUrl();
    const token = this.store.token;
    return server && token && this.store.deviceId
      ? JSON.stringify([server, this.store.deviceId, token])
      : null;
  }

  /**
   * The window in front as the tracker last saw it (a private one without its title, an
   * excluded program not at all), with how long there has been no input; `null` — none.
   */
  frontWindow(): {
    app: string;
    name: string | null;
    title: string;
    idleSeconds: number;
  } | null {
    if (!this.front) {
      return null;
    }
    const {app, name, title} = this.front;
    return {app, name, title, idleSeconds: powerMonitor.getSystemIdleTime()};
  }

  focusStatus(): FocusStatus & {available: boolean} {
    return {...this.focus.status(), available: !!this.store.deviceId};
  }

  /** A focus session needs a device to report to: tracking enabled on this computer. */
  startFocus(
    options: {projectId?: string | null; note?: string | null} = {},
  ): void {
    if (this.store.deviceId) {
      this.focus.start(options);
    }
  }

  private get paused(): boolean {
    const until = this.store.pausedUntil;
    if (until === null) {
      return false;
    }
    if (until !== 0 && until <= Date.now()) {
      this.store.setPausedUntil(null);
      return false;
    }
    return true;
  }

  private setLocked(locked: boolean): void {
    this.locked = locked;
    if (locked) {
      this.close();
      this.breaks.reset();
    }
  }

  private takeHealth(): void {
    if (this.store.deviceId) {
      void this.health
        .collect()
        .then(snapshot => (this.pendingHealth = snapshot));
    }
  }

  private onSample(observed: WindowSample | null): void {
    let sample = observed;
    const now = Date.now();
    const config = this.store.config;
    const idleMs = powerMonitor.getSystemIdleTime() * 1000;
    if (this.telemetryIdentity() !== this.sourceIdentity) {
      this.resetTelemetry();
      this.sourceIdentity = this.telemetryIdentity();
    }
    this.sourceSampleAt = now;
    this.windowCollection = !sample
      ? 'waiting-window'
      : isExcluded(sample, config)
        ? 'excluded-app'
        : isPrivateWindow(sample.title, config.privateWords)
          ? 'private-window'
          : sanitizeTelemetryText(sample.app)
            ? 'collecting'
            : 'waiting-window';
    // Unlike legacy spans, telemetry entirely excludes private windows and idle video players.
    // Apply these checks to the original title, before legacy span title redaction below.
    this.smartWindowAllowed =
      !!sample &&
      !this.locked &&
      !this.paused &&
      !isExcluded(sample, config) &&
      !isPrivateWindow(sample.title, config.privateWords);
    this.telemetryAllowed =
      this.smartWindowAllowed && idleMs < config.idleMinutes * 60_000;
    if (!this.telemetryAllowed) this.workstateEpoch++;
    this.followMeeting(sample, now);
    this.telemetry.sample(
      this.telemetryAllowed ? (sample?.app ?? null) : null,
      now,
    );
    this.syncSources();
    this.breaks.tick(now, idleMs, {
      away: this.locked || this.paused,
      breakMinutes: config.breakMinutes,
      quiet: this.focus.working,
    });
    if (!sample || this.locked || this.paused || isExcluded(sample, config)) {
      this.front = null;
      this.keep(this.spans.feed(null, now));
      return;
    }
    // A private window: the program is recorded, its title never leaves the computer.
    if (isPrivateWindow(sample.title, config.privateWords)) {
      sample = {...sample, title: ''};
    }
    this.front = {...sample, at: now};
    if (
      idleMs < config.idleMinutes * 60_000 &&
      config.distractingApps.includes(sample.app.toLowerCase())
    ) {
      this.focus.distraction(
        sample.app.toLowerCase(),
        sample.name ?? sample.app,
        SAMPLE_SECONDS,
      );
    }
    // No keyboard or mouse for a while means the user went away — at the moment the input
    // stopped. A film is the exception: a full-screen player or browser needs no input, for a
    // few hours. A game is not: a game left running without input is the user gone (asleep).
    if (idleMs >= config.idleMinutes * 60_000) {
      const watching =
        sample.fullscreen &&
        config.watchApps.includes(sample.app.toLowerCase()) &&
        idleMs < WATCH_WITHOUT_INPUT_MS;
      if (!watching) {
        // Past the limit of a film, the time up to now has been counted already.
        const since =
          sample.fullscreen && idleMs >= WATCH_WITHOUT_INPUT_MS
            ? now
            : now - idleMs;
        this.keep(this.spans.feed(null, since));
        return;
      }
    }
    this.keep(this.spans.feed(sample, now));
  }

  /** A call is going on: notifications wait (see `holdDuringMeeting`). */
  get inMeeting(): boolean {
    return Date.now() < this.meetingUntil;
  }

  /** A notification arrived during a call: counted, told about when the call ends. */
  holdDuringMeeting(): void {
    this.heldInMeeting++;
  }

  /**
   * A call stays "on" a little after its window leaves the front: switching to a document
   * during a call is still the call.
   */
  private followMeeting(sample: WindowSample | null, now: number): void {
    const config = this.store.config;
    if (
      sample &&
      !this.locked &&
      isMeeting(sample.app, sample.title, config.meetingApps)
    ) {
      this.meetingUntil = now + MEETING_GRACE_MS;
      return;
    }
    if (this.meetingUntil && now >= this.meetingUntil) {
      this.meetingUntil = 0;
      if (this.heldInMeeting) {
        this.notice({kind: 'meeting-ended', held: this.heldInMeeting});
      }
      this.heldInMeeting = 0;
    }
  }

  private close(): void {
    this.resetTelemetry();
    this.keep(this.spans.flush());
  }

  private keep(span: Span | null): void {
    if (span) {
      this.store.enqueue(span);
      this.onChange();
    }
  }

  /** Sends what waits, oldest first; the answer carries the settings to follow from now on. */
  private async upload(): Promise<void> {
    const server = this.serverUrl();
    const token = this.store.token;
    if (this.uploading || !server || !token) {
      return;
    }
    this.uploading = true;
    try {
      // An empty batch is sent too: it is how a new exclusion or idle time reaches the tracker.
      // Focus sessions and the computer's state go with the first batch.
      let first = true;
      // Halved when the server finds a batch too large; back to full on the next upload.
      let size = BATCH;
      do {
        const batch = this.takeBatch(size, first);
        first = false;
        const response = await this.post(server, token, batch);
        switch (outcomeOf(response.status, batch.spans.length)) {
          case 'removed':
            // The device was removed in the dashboard: this computer no longer reports.
            this.disable();
            return;
          case 'too-large':
            // Too large for the server: the same spans go again in smaller batches.
            size = Math.ceil(batch.spans.length / 2);
            first = true;
            continue;
          case 'refused':
            // The server will never take these (a span it finds wrong): they are dropped, or
            // they would block everything after them for good.
            this.forget(batch);
            continue;
          case 'down':
            // The server answers, but with an error (a restart, a deploy): it is down for us.
            await this.outages.failed();
            return;
          case 'failed':
            return;
        }
        this.outages.succeeded();
        const config = mergedConfig(this.store.config, await response.json());
        if (config) {
          if (JSON.stringify(config) !== JSON.stringify(this.store.config))
            this.resetTelemetry();
          this.store.setConfig(config);
        }
        this.forget(batch);
        this.onChange();
      } while (this.store.queue.length >= size);
    } catch {
      // No connection: the spans wait in the store, the outage is noted.
      await this.outages.failed();
    } finally {
      this.uploading = false;
    }
  }

  /** The oldest spans; the first batch of an upload carries the rest of what waits too. */
  private takeBatch(size: number, first: boolean): Batch {
    return {
      spans: this.store.queue.slice(0, size),
      focus: first ? this.store.focusQueue.slice(0, FOCUS_BATCH) : [],
      health: first ? this.pendingHealth : null,
      outages: first ? this.store.outageQueue.slice() : [],
    };
  }

  /** When the running work part ends; `null` — none runs (a break is not one). */
  private focusUntil(): string | null {
    return this.focus.working ? this.focus.status().endsAt : null;
  }

  private async post(
    server: string,
    token: string,
    batch: Batch,
  ): Promise<Response> {
    const focusUntil = this.focusUntil();
    const response = await net.fetch(
      new URL('/api/activity/device/spans', server).href,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Device ${token}`,
        },
        body: JSON.stringify({
          focusUntil,
          spans: batch.spans,
          ...(batch.focus.length ? {focus: batch.focus} : {}),
          ...(batch.health ? {health: batch.health} : {}),
          ...(batch.outages.length ? {outages: batch.outages} : {}),
        }),
        signal: AbortSignal.timeout(UPLOAD_TIMEOUT_MS),
      },
    );
    if (response.ok) {
      this.toldFocusUntil = focusUntil;
    }
    return response;
  }

  /** What the server has (or will never take) leaves the store. */
  private forget(batch: Batch): void {
    this.store.dequeue(batch.spans.length);
    this.store.dequeueFocus(new Set(batch.focus.map(session => session.id)));
    this.store.dequeueOutages(new Set(batch.outages.map(outage => outage.id)));
    if (batch.health && this.pendingHealth === batch.health) {
      this.pendingHealth = null;
    }
  }
}

function isExcluded(sample: WindowSample, config: TrackerConfig): boolean {
  return config.excludedApps.includes(sample.app.toLowerCase());
}

/** One upload: spans, and with the first of an upload what else waits. */
interface Batch {
  spans: Span[];
  focus: FocusSession[];
  health: HealthSnapshot | null;
  outages: Outage[];
}

/** What the server's answer to a batch means for the queue. */
function outcomeOf(
  status: number,
  spans: number,
): 'sent' | 'removed' | 'too-large' | 'refused' | 'down' | 'failed' {
  if (status >= 200 && status < 300) {
    return 'sent';
  }
  if (status === 401) {
    return 'removed';
  }
  if (status === 413 && spans > 1) {
    return 'too-large';
  }
  if (status === 400 || status === 413) {
    return 'refused';
  }
  return status >= 500 ? 'down' : 'failed';
}

/**
 * The settings the server sent, over the ones known: a field an older server does not send
 * keeps its value. `null` — the answer is not settings at all.
 */
function mergedConfig(
  known: TrackerConfig,
  sent: Partial<TrackerConfig>,
): TrackerConfig | null {
  if (
    typeof sent.idleMinutes !== 'number' ||
    !Array.isArray(sent.excludedApps)
  ) {
    return null;
  }
  const list = (value: string[] | undefined, fallback: string[]) =>
    Array.isArray(value) ? value : fallback;
  return {
    idleMinutes: sent.idleMinutes,
    excludedApps: sent.excludedApps,
    watchApps: list(sent.watchApps, []),
    breakMinutes:
      typeof sent.breakMinutes === 'number'
        ? sent.breakMinutes
        : known.breakMinutes,
    focus: sent.focus ?? known.focus,
    distractingApps: list(sent.distractingApps, known.distractingApps),
    privateWords: list(sent.privateWords, known.privateWords),
    meetingApps: list(sent.meetingApps, known.meetingApps),
  };
}

import { net, powerMonitor } from 'electron';
import { ActivityStore, TrackerConfig } from './activity-store';
import { BreakReminder } from './break-reminder';
import { FocusPhase, FocusSession, FocusStatus, FocusTimer } from './focus-timer';
import { HealthCollector, HealthSnapshot } from './health';
import { Span, SpanBuilder, WindowSample } from './span-builder';
import { isMeeting, isPrivateWindow } from './window-rules';
import { SAMPLE_SECONDS, WindowWatcher } from './window-watcher';

/** What waits is sent this often. */
const UPLOAD_MS = 60_000;
/** A film without input counts this long at most: longer, the user has fallen asleep. */
const WATCH_WITHOUT_INPUT_MS = 3 * 60 * 60 * 1000;
/** The server takes this many spans at a time (see activityIngestSchema). */
const BATCH = 500;
/** And this many focus sessions. */
const FOCUS_BATCH = 50;
/** How often the state of the computer (disks, load) is taken. */
const HEALTH_MS = 5 * 60_000;
const FIRST_HEALTH_MS = 20_000;
/** A call is still on this long after its window left the front. */
const MEETING_GRACE_MS = 2 * 60_000;

/** What the tracker tells the user; the shell shows it as a system notification. */
export type TrackerNotice =
  | { kind: 'break'; minutes: number }
  | { kind: 'focus-ended'; next: FocusPhase; held: number; minutes: number }
  | { kind: 'break-ended' }
  /** A call ended; `held` — notifications that waited for it. */
  | { kind: 'meeting-ended'; held: number };

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
  private readonly watcher = new WindowWatcher((sample) => this.onSample(sample));
  private locked = false;
  private uploading = false;
  /** A call is in front (or was a moment ago): the app keeps quiet. */
  private meetingUntil = 0;
  private heldInMeeting = 0;
  private readonly breaks = new BreakReminder((minutes) => this.notice({ kind: 'break', minutes }));
  private readonly health = new HealthCollector();
  /** The latest state of the computer, sent with the next upload. */
  private pendingHealth: HealthSnapshot | null = null;
  readonly focus = new FocusTimer(() => this.store.config.focus, {
    session: (session: FocusSession) => this.store.enqueueFocus(session),
    phaseEnded: (ended, next, held) => {
      const settings = this.store.config.focus;
      const minutes =
        next === 'long-break' ? settings.longBreakMinutes : settings.shortBreakMinutes;
      this.notice(
        ended === 'focus' ? { kind: 'focus-ended', next, held, minutes } : { kind: 'break-ended' },
      );
    },
    changed: () => this.onChange(),
  });

  constructor(
    private readonly serverUrl: () => string | null,
    /** Called when the status changes — the tray menu shows it. */
    private readonly onChange: () => void,
    /** A reminder to take a break, the end of a focus part. */
    private readonly notice: (notice: TrackerNotice) => void,
  ) {}

  start(): void {
    powerMonitor.on('lock-screen', () => this.setLocked(true));
    powerMonitor.on('unlock-screen', () => this.setLocked(false));
    powerMonitor.on('suspend', () => {
      this.close();
      this.breaks.reset();
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
  enable(device: { id: string; token: string }): void {
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
      minutes === null ? null : minutes === 0 ? 0 : Date.now() + minutes * 60_000,
    );
    if (minutes !== null) {
      this.close();
    }
    this.onChange();
  }

  /** Before the app quits: the open span and focus part are saved and what waits is sent. */
  async stop(): Promise<void> {
    this.watcher.stop();
    this.close();
    this.focus.stop();
    await this.upload();
  }

  focusStatus(): FocusStatus & { available: boolean } {
    return { ...this.focus.status(), available: !!this.store.deviceId };
  }

  /** A focus session needs a device to report to: tracking enabled on this computer. */
  startFocus(options: { projectId?: string | null; note?: string | null } = {}): void {
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
      void this.health.collect().then((snapshot) => (this.pendingHealth = snapshot));
    }
  }

  private onSample(observed: WindowSample | null): void {
    let sample = observed;
    const now = Date.now();
    const config = this.store.config;
    const idleMs = powerMonitor.getSystemIdleTime() * 1000;
    this.breaks.tick(now, idleMs, {
      away: this.locked || this.paused,
      breakMinutes: config.breakMinutes,
      quiet: this.focus.working,
    });
    this.followMeeting(sample, now);
    if (!sample || this.locked || this.paused || isExcluded(sample, config)) {
      this.keep(this.spans.feed(null, now));
      return;
    }
    // A private window: the program is recorded, its title never leaves the computer.
    if (isPrivateWindow(sample.title, config.privateWords)) {
      sample = { ...sample, title: '' };
    }
    if (
      idleMs < config.idleMinutes * 60_000 &&
      config.distractingApps.includes(sample.app.toLowerCase())
    ) {
      this.focus.distraction(sample.app.toLowerCase(), sample.name ?? sample.app, SAMPLE_SECONDS);
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
        const since = sample.fullscreen && idleMs >= WATCH_WITHOUT_INPUT_MS ? now : now - idleMs;
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
    if (sample && !this.locked && isMeeting(sample.app, sample.title, config.meetingApps)) {
      this.meetingUntil = now + MEETING_GRACE_MS;
      return;
    }
    if (this.meetingUntil && now >= this.meetingUntil) {
      this.meetingUntil = 0;
      if (this.heldInMeeting) {
        this.notice({ kind: 'meeting-ended', held: this.heldInMeeting });
      }
      this.heldInMeeting = 0;
    }
  }

  private close(): void {
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
      do {
        const batch = this.store.queue.slice(0, BATCH);
        const focus = first ? this.store.focusQueue.slice(0, FOCUS_BATCH) : [];
        const health = first ? this.pendingHealth : null;
        first = false;
        const response = await net.fetch(new URL('/api/activity/device/spans', server).href, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Device ${token}` },
          body: JSON.stringify({
            spans: batch,
            ...(focus.length ? { focus } : {}),
            ...(health ? { health } : {}),
          }),
        });
        if (response.status === 401) {
          // The device was removed in the dashboard: this computer no longer reports.
          this.disable();
          return;
        }
        if (!response.ok) {
          return;
        }
        const config = (await response.json()) as Partial<TrackerConfig>;
        if (typeof config.idleMinutes === 'number' && Array.isArray(config.excludedApps)) {
          const known = this.store.config;
          this.store.setConfig({
            idleMinutes: config.idleMinutes,
            excludedApps: config.excludedApps,
            watchApps: Array.isArray(config.watchApps) ? config.watchApps : [],
            breakMinutes:
              typeof config.breakMinutes === 'number' ? config.breakMinutes : known.breakMinutes,
            focus: config.focus ?? known.focus,
            distractingApps: Array.isArray(config.distractingApps)
              ? config.distractingApps
              : known.distractingApps,
            privateWords: Array.isArray(config.privateWords)
              ? config.privateWords
              : known.privateWords,
            meetingApps: Array.isArray(config.meetingApps) ? config.meetingApps : known.meetingApps,
          });
        }
        this.store.dequeue(batch.length);
        this.store.dequeueFocus(new Set(focus.map((session) => session.id)));
        if (health && this.pendingHealth === health) {
          this.pendingHealth = null;
        }
        this.onChange();
      } while (this.store.queue.length >= BATCH);
    } catch {
      // No connection: the spans wait in the store.
    } finally {
      this.uploading = false;
    }
  }
}

function isExcluded(sample: WindowSample, config: TrackerConfig): boolean {
  return config.excludedApps.includes(sample.app.toLowerCase());
}

import { randomUUID } from 'node:crypto';

/** The timer's lengths, from the dashboard (ActivityFocusSettings in contracts). */
export interface FocusSettings {
  focusMinutes: number;
  shortBreakMinutes: number;
  longBreakMinutes: number;
  roundsBeforeLongBreak: number;
}

/** A finished work part, as the server takes it (activityFocusSessionSchema in contracts). */
export interface FocusSession {
  id: string;
  startedAt: string;
  endedAt: string;
  plannedMinutes: number;
  focusSeconds: number;
  completed: boolean;
  projectId: string | null;
  note: string | null;
  distractions: { app: string; name: string; seconds: number }[];
}

export type FocusPhase = 'idle' | 'focus' | 'short-break' | 'long-break';

export interface FocusStatus {
  phase: FocusPhase;
  /** When the current part ends (ISO); `null` when idle. */
  endsAt: string | null;
  /** Work parts completed since the last long break. */
  round: number;
  roundsBeforeLongBreak: number;
  projectId: string | null;
  note: string | null;
  /** Notifications held back during the current work part. */
  held: number;
}

/** A session stopped sooner than this is not kept: it was a misclick. */
const MIN_KEPT_SECONDS = 60;
const MAX_DISTRACTIONS = 20;

/**
 * The focus timer (Pomodoro): a work part, then a short break — a long one after every few
 * rounds. A work part that ends or is stopped becomes a session for the server, with the time
 * spent in distracting programs (recorded, never interrupted). The next round is started by
 * the user: the timer does not start working on its own.
 */
export class FocusTimer {
  private phase: FocusPhase = 'idle';
  private endsAt = 0;
  private timer: NodeJS.Timeout | null = null;
  private round = 0;
  private current: {
    id: string;
    startedAt: number;
    plannedMinutes: number;
    projectId: string | null;
    note: string | null;
    distractions: Map<string, { name: string; seconds: number }>;
  } | null = null;
  private held = 0;

  constructor(
    private readonly settings: () => FocusSettings,
    private readonly events: {
      /** A work part ended or was stopped: the session goes to the server. */
      session: (session: FocusSession) => void;
      /** The phase changed on its own (a part ran out); `held` — notifications held back. */
      phaseEnded: (ended: FocusPhase, next: FocusPhase, held: number) => void;
      changed: () => void;
    },
  ) {}

  status(): FocusStatus {
    return {
      phase: this.phase,
      endsAt: this.phase === 'idle' ? null : new Date(this.endsAt).toISOString(),
      round: this.round,
      roundsBeforeLongBreak: this.settings().roundsBeforeLongBreak,
      projectId: this.current?.projectId ?? null,
      note: this.current?.note ?? null,
      held: this.held,
    };
  }

  get working(): boolean {
    return this.phase === 'focus';
  }

  start(options: { projectId?: string | null; note?: string | null } = {}): void {
    if (this.phase === 'focus') {
      return;
    }
    const minutes = this.settings().focusMinutes;
    this.current = {
      id: randomUUID(),
      startedAt: Date.now(),
      plannedMinutes: minutes,
      projectId: options.projectId ?? null,
      note: options.note?.trim() || null,
      distractions: new Map(),
    };
    this.held = 0;
    this.enter('focus', minutes);
  }

  /** Stops a work part (it is kept if it ran a minute) or skips a break. */
  stop(): void {
    if (this.phase === 'focus') {
      this.finishSession(false);
    }
    this.enter('idle', 0);
  }

  /** The tracker saw this program in front for `seconds` during a work part. */
  distraction(app: string, name: string, seconds: number): void {
    if (this.phase !== 'focus' || !this.current) {
      return;
    }
    const known = this.current.distractions.get(app) ?? { name, seconds: 0 };
    known.seconds += seconds;
    this.current.distractions.set(app, known);
  }

  /** A notification arrived during a work part: it waits instead of interrupting. */
  hold(): void {
    this.held++;
  }

  private enter(phase: FocusPhase, minutes: number): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.phase = phase;
    if (phase !== 'idle') {
      this.endsAt = Date.now() + minutes * 60_000;
      this.timer = setTimeout(() => this.partEnded(), minutes * 60_000);
    }
    this.events.changed();
  }

  private partEnded(): void {
    const ended = this.phase;
    const settings = this.settings();
    if (ended === 'focus') {
      const held = this.held;
      this.finishSession(true);
      this.round++;
      const long = this.round >= settings.roundsBeforeLongBreak;
      if (long) {
        this.round = 0;
      }
      this.enter(
        long ? 'long-break' : 'short-break',
        long ? settings.longBreakMinutes : settings.shortBreakMinutes,
      );
      this.events.phaseEnded(ended, this.phase, held);
    } else {
      this.enter('idle', 0);
      this.events.phaseEnded(ended, 'idle', 0);
    }
  }

  private finishSession(completed: boolean): void {
    const session = this.current;
    this.current = null;
    if (!session) {
      return;
    }
    const now = Date.now();
    const focusSeconds = Math.round((now - session.startedAt) / 1000);
    if (!completed && focusSeconds < MIN_KEPT_SECONDS) {
      return;
    }
    this.events.session({
      id: session.id,
      startedAt: new Date(session.startedAt).toISOString(),
      endedAt: new Date(now).toISOString(),
      plannedMinutes: session.plannedMinutes,
      focusSeconds,
      completed,
      projectId: session.projectId,
      note: session.note,
      distractions: [...session.distractions]
        .map(([app, { name, seconds }]) => ({ app, name, seconds }))
        .sort((a, b) => b.seconds - a.seconds)
        .slice(0, MAX_DISTRACTIONS),
    });
  }
}

import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {FocusPhase, FocusSession, FocusTimer} from './focus-timer';

const SETTINGS = {
  focusMinutes: 25,
  shortBreakMinutes: 5,
  longBreakMinutes: 15,
  roundsBeforeLongBreak: 2,
};

describe('FocusTimer', () => {
  let sessions: FocusSession[];
  let phases: [FocusPhase, FocusPhase, number][];
  let timer: FocusTimer;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(Date.UTC(2026, 9, 31, 9));
    sessions = [];
    phases = [];
    timer = new FocusTimer(() => SETTINGS, {
      session: session => sessions.push(session),
      phaseEnded: (ended, next, held) => phases.push([ended, next, held]),
      changed: () => undefined,
    });
  });

  afterEach(() => vi.useRealTimers());

  it('runs a work part, a short break, and a long one after the rounds', () => {
    timer.start({projectId: 'p1', note: '  docs  '});
    timer.hold();
    vi.advanceTimersByTime(25 * 60_000);
    expect(phases.at(-1)).toEqual(['focus', 'short-break', 1]);
    expect(sessions[0]).toMatchObject({
      completed: true,
      focusSeconds: 1500,
      plannedMinutes: 25,
      projectId: 'p1',
      note: 'docs',
    });
    vi.advanceTimersByTime(5 * 60_000);
    expect(timer.status().phase).toBe('idle');

    timer.start();
    vi.advanceTimersByTime(25 * 60_000);
    expect(phases.at(-1)).toEqual(['focus', 'long-break', 0]);
    expect(timer.status().round).toBe(0);
  });

  it('keeps a stopped part only when it ran a minute', () => {
    timer.start();
    vi.advanceTimersByTime(30_000);
    timer.stop();
    expect(sessions).toHaveLength(0);

    timer.start();
    vi.advanceTimersByTime(10 * 60_000);
    timer.stop();
    expect(sessions[0]).toMatchObject({completed: false, focusSeconds: 600});
    expect(timer.status()).toMatchObject({phase: 'idle', endsAt: null});
  });

  it('counts distracting programs of a work part, the longest first', () => {
    timer.distraction('steam', 'Steam', 60); // Before the start: not counted.
    timer.start();
    timer.distraction('telegram', 'Telegram', 30);
    timer.distraction('steam', 'Steam', 90);
    timer.distraction('telegram', 'Telegram', 20);
    timer.stop();
    expect(sessions).toHaveLength(0); // Under a minute.

    timer.start();
    timer.distraction('telegram', 'Telegram', 30);
    timer.distraction('steam', 'Steam', 90);
    vi.advanceTimersByTime(25 * 60_000);
    expect(sessions[0].distractions).toEqual([
      {app: 'steam', name: 'Steam', seconds: 90},
      {app: 'telegram', name: 'Telegram', seconds: 30},
    ]);
  });
});

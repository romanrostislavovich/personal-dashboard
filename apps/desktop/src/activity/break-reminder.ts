/** No input this long, a locked screen or a sleeping computer is a break. */
export const BREAK_MS = 5 * 60_000;
/** Not taken: reminded again after this long. */
const REMIND_AGAIN_MS = 15 * 60_000;

/**
 * Counts how long the user has been at the computer without a break and says when it is time
 * for one — once at the configured length, then every quarter of an hour until a break is taken.
 */
export class BreakReminder {
  /** Since when the user has been at the computer; `null` — on a break now. */
  private activeSince: number | null = null;
  private remindedAt: number | null = null;

  constructor(private readonly remind: (minutesWithoutBreak: number) => void) {}

  /**
   * Every sample of the tracker. `idleMs` — time since the last input; `away` — locked,
   * asleep or paused; `quiet` — no reminders now (a focus session has its own breaks).
   */
  tick(
    now: number,
    idleMs: number,
    options: { away: boolean; breakMinutes: number; quiet: boolean },
  ): void {
    if (options.away || idleMs >= BREAK_MS) {
      this.activeSince = null;
      this.remindedAt = null;
      return;
    }
    this.activeSince ??= now - idleMs;
    if (!options.breakMinutes || options.quiet) {
      return;
    }
    const activeMs = now - this.activeSince;
    const due =
      activeMs >= options.breakMinutes * 60_000 &&
      (this.remindedAt === null || now - this.remindedAt >= REMIND_AGAIN_MS);
    if (due) {
      this.remindedAt = now;
      this.remind(Math.round(activeMs / 60_000));
    }
  }

  /** The screen was locked or the computer went to sleep: that is a break too. */
  reset(): void {
    this.activeSince = null;
    this.remindedAt = null;
  }
}

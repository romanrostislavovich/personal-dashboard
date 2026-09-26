import { MonitorStatus } from '@pd/contracts';

/**
 * Сколько неудачных проверок подряд нужно, чтобы объявить сайт упавшим.
 * Одна ошибка — часто сетевой «чих», поэтому не будим из-за неё.
 */
export const FAILURES_TO_GO_DOWN = 2;

export interface MonitorState {
  status: MonitorStatus;
  consecutiveFailures: number;
  failingSince: Date | null;
}

export type MonitorEvent =
  { type: 'down'; since: Date } | { type: 'recovered'; downtimeMs: number };

/** Новое состояние монитора после проверки и событие для уведомления (если есть). */
export function applyCheck(
  state: MonitorState,
  isUp: boolean,
  now: Date,
): { state: MonitorState; event: MonitorEvent | null } {
  if (isUp) {
    const event: MonitorEvent | null =
      state.status === 'down' && state.failingSince
        ? { type: 'recovered', downtimeMs: now.getTime() - state.failingSince.getTime() }
        : null;
    return { state: { status: 'up', consecutiveFailures: 0, failingSince: null }, event };
  }

  const consecutiveFailures = state.consecutiveFailures + 1;
  const failingSince = state.failingSince ?? now;
  const goesDown = state.status !== 'down' && consecutiveFailures >= FAILURES_TO_GO_DOWN;
  return {
    state: {
      status: goesDown ? 'down' : state.status,
      consecutiveFailures,
      failingSince,
    },
    event: goesDown ? { type: 'down', since: failingSince } : null,
  };
}

const SSL_REMINDER_DAYS = [14, 7, 3, 1];

/** Напоминать ли сегодня про сертификат: за 14/7/3/1 день и каждый день после истечения. */
export function isSslReminderDay(daysLeft: number): boolean {
  return daysLeft <= 0 || SSL_REMINDER_DAYS.includes(daysLeft);
}

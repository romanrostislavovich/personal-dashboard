import {httpResource} from '@angular/common/http';
import {inject, Injectable} from '@angular/core';
import {HABITS_READS, habitsApi} from '@pd/client-core';
import {Habit, HabitDayInput, HabitInput, HabitKind} from '@pd/contracts';
import {DASHBOARD_CLIENT, fromCore} from '@pd/web-core';

/** The habit requests of the client core (`@pd/client-core`) for Angular. */
@Injectable({providedIn: 'root'})
export class HabitsApi {
  private readonly habits = habitsApi(inject(DASHBOARD_CLIENT).api);

  /** Reactive list; call it in a component field. */
  list() {
    return httpResource<Habit[]>(() => HABITS_READS.list(), {defaultValue: []});
  }

  create(input: HabitInput) {
    return fromCore(() => this.habits.create(input));
  }

  update(id: string, input: HabitInput) {
    return fromCore(() => this.habits.update(id, input));
  }

  remove(id: string) {
    return fromCore(() => this.habits.remove(id));
  }

  mark(id: string, day: string, input: HabitDayInput) {
    return fromCore(() => this.habits.mark(id, day, input));
  }

  unmark(id: string, day: string) {
    return fromCore(() => this.habits.unmark(id, day));
  }
}

/** Today on this device, `YYYY-MM-DD`. */
export function localToday(): string {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** The emoji of each kind, and of a habit of one's own to build. */
export const HABIT_ICONS = {
  alcohol: '🍷',
  smoking: '🚬',
  gym: '🏋️',
  custom: '✨',
} as const;
export const BUILD_ICON = '💪';

/** The emoji of a habit: a kind's own, or the one of building for a habit of one's own. */
export function habitIcon(kind: HabitKind, build: boolean): string {
  return kind === 'custom' && build ? BUILD_ICON : HABIT_ICONS[kind];
}

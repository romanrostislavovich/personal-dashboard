import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { addDays, Habit, HABIT_CALENDAR_DAYS, parseLocalDate, toLocalDate } from '@pd/contracts';
import { HABIT_ICONS, localToday } from './habits.api';

/** A day of the calendar: before the start (none), clean, with it, or still to come. */
interface CalendarDay {
  day: string;
  state: 'none' | 'clean' | 'used' | 'future';
  amount: number | null;
}

/** A change a card asks the page for. */
export type HabitCardAction =
  | { type: 'mark'; day: string; amount: number | null }
  | { type: 'unmark'; day: string }
  | { type: 'edit' }
  | { type: 'remove' };

/**
 * One habit: the run of clean days, big; the best run and the other numbers; the calendar of the
 * last weeks, where a click marks a day with it or takes the mark off; and "It happened today".
 */
@Component({
  selector: 'pd-habit-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, MatButtonModule, MatCardModule, MatIconModule, MatMenuModule, TranslocoPipe],
  template: `
    @let h = habit();
    <mat-card appearance="outlined">
      <mat-card-header>
        <span mat-card-avatar class="icon">{{ icon() }}</span>
        <mat-card-title>{{ title() }}</mat-card-title>
        <mat-card-subtitle>
          @if (h.goal === 'quit') {
            {{ 'habits.goals.quit' | transloco }}
          } @else {
            {{ 'habits.goals.lessThan' | transloco: { days: h.maxDaysPerWeek } }}
          }
          · {{ 'habits.card.since' | transloco: { day: (h.startedOn | date: 'd MMM y') } }}
        </mat-card-subtitle>
        <button
          matIconButton
          class="more"
          [matMenuTriggerFor]="menu"
          [attr.aria-label]="'habits.card.more' | transloco"
        >
          <mat-icon>more_vert</mat-icon>
        </button>
        <mat-menu #menu="matMenu">
          <button mat-menu-item (click)="action.emit({ type: 'edit' })">
            <mat-icon>edit</mat-icon> {{ 'core.actions.edit' | transloco }}
          </button>
          <button mat-menu-item (click)="action.emit({ type: 'remove' })">
            <mat-icon>delete</mat-icon> {{ 'core.actions.delete' | transloco }}
          </button>
        </mat-menu>
      </mat-card-header>
      <mat-card-content class="content">
        <div class="streak">
          <span class="number">{{ h.stats.currentStreak }}</span>
          <span class="label">{{ 'habits.card.streak' | transloco }}</span>
        </div>
        <div class="numbers">
          <span>{{ 'habits.card.best' | transloco: { days: h.stats.bestStreak } }}</span>
          <span>{{ 'habits.card.clean' | transloco: { days: h.stats.cleanDays } }}</span>
          @if (h.goal === 'less') {
            <span [class.over]="h.stats.usedThisWeek > (h.maxDaysPerWeek ?? 0)">
              {{
                'habits.card.thisWeek'
                  | transloco: { used: h.stats.usedThisWeek, max: h.maxDaysPerWeek }
              }}
            </span>
            <span>{{ 'habits.card.weeks' | transloco: { weeks: h.stats.weeksWithinLimit } }}</span>
          }
        </div>

        <div class="calendar" role="grid" [attr.aria-label]="'habits.card.calendar' | transloco">
          @for (cell of calendar(); track cell.day) {
            <button
              type="button"
              class="cell"
              [class]="'cell ' + cell.state"
              [disabled]="cell.state === 'none' || cell.state === 'future'"
              [title]="cellTitle(cell)"
              [attr.aria-label]="cellTitle(cell)"
              (click)="toggle(cell)"
            ></button>
          }
        </div>
        <p class="hint">{{ 'habits.card.calendarHint' | transloco }}</p>
      </mat-card-content>
      <mat-card-actions align="end">
        @if (todayUsed()) {
          <button matButton (click)="action.emit({ type: 'unmark', day: today })">
            <mat-icon>undo</mat-icon> {{ 'habits.card.undoToday' | transloco }}
          </button>
        } @else {
          <button matButton="tonal" (click)="markToday()">
            {{ 'habits.card.usedToday' | transloco }}
          </button>
        }
      </mat-card-actions>
    </mat-card>
  `,
  styles: `
    .icon {
      display: grid;
      place-items: center;
      font-size: 28px;
    }
    .more {
      margin-left: auto;
    }
    .content {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .streak {
      display: flex;
      align-items: baseline;
      gap: 8px;
    }
    .number {
      font: var(--mat-sys-display-medium);
      color: var(--mat-sys-primary);
    }
    .label {
      font: var(--mat-sys-title-medium);
      color: var(--mat-sys-on-surface-variant);
    }
    .numbers {
      display: flex;
      flex-wrap: wrap;
      gap: 4px 16px;
      font: var(--mat-sys-body-medium);
      color: var(--mat-sys-on-surface-variant);
    }
    .over {
      color: var(--mat-sys-error);
    }
    .calendar {
      display: grid;
      grid-template-rows: repeat(7, 14px);
      grid-auto-flow: column;
      grid-auto-columns: 14px;
      gap: 3px;
    }
    .cell {
      padding: 0;
      border: 0;
      border-radius: 3px;
      cursor: pointer;
    }
    .cell.none,
    .cell.future {
      cursor: default;
      background: var(--mat-sys-surface-container);
    }
    .cell.future {
      opacity: 0.4;
    }
    .cell.clean {
      background: color-mix(in srgb, var(--mat-sys-primary) 55%, transparent);
    }
    .cell.used {
      background: var(--mat-sys-error);
    }
    .hint {
      margin: 0;
      color: var(--mat-sys-on-surface-variant);
      font: var(--mat-sys-body-small);
    }
  `,
})
export class HabitCardComponent {
  private readonly transloco = inject(TranslocoService);

  readonly habit = input.required<Habit>();
  readonly action = output<HabitCardAction>();

  protected readonly today = localToday();
  protected readonly icon = computed(() => HABIT_ICONS[this.habit().kind]);
  protected readonly title = computed(() => {
    const habit = this.habit();
    return habit.kind === 'custom'
      ? (habit.name ?? '')
      : this.transloco.translate(`habits.kinds.${habit.kind}`);
  });
  protected readonly todayUsed = computed(() =>
    this.habit().recent.some((mark) => mark.day === this.today && mark.status === 'used'),
  );

  /** The weeks up to this one, from Monday, as a column each. */
  protected readonly calendar = computed<CalendarDay[]>(() => {
    const habit = this.habit();
    const marks = new Map(habit.recent.map((mark) => [mark.day, mark]));
    const today = parseLocalDate(this.today);
    const weekday =
      (new Date(Date.UTC(today.year, today.month - 1, today.day)).getUTCDay() + 6) % 7;
    const weeks = Math.floor(HABIT_CALENDAR_DAYS / 7);
    const first = addDays(today, -weekday - (weeks - 1) * 7);
    return Array.from({ length: weeks * 7 }, (_, index) => {
      const day = toLocalDate(addDays(first, index));
      const mark = marks.get(day);
      const state =
        day > this.today
          ? 'future'
          : day < habit.startedOn
            ? 'none'
            : mark?.status === 'used'
              ? 'used'
              : 'clean';
      return { day, state, amount: mark?.amount ?? null };
    });
  });

  protected cellTitle(cell: CalendarDay): string {
    const what =
      cell.state === 'used'
        ? this.transloco.translate('habits.card.dayUsed')
        : cell.state === 'clean'
          ? this.transloco.translate('habits.card.dayClean')
          : '';
    const amount = cell.amount != null ? ` · ${cell.amount} ${this.habit().unit ?? ''}` : '';
    return `${cell.day}${what ? ` — ${what}` : ''}${amount}`;
  }

  /** A clean day becomes a day with it (asking how much, for a unit); a day with it, clean. */
  protected toggle(cell: CalendarDay): void {
    if (cell.state === 'used') {
      this.action.emit({ type: 'unmark', day: cell.day });
    } else if (cell.state === 'clean') {
      this.mark(cell.day);
    }
  }

  protected markToday(): void {
    this.mark(this.today);
  }

  private mark(day: string): void {
    const unit = this.habit().unit;
    let amount: number | null = null;
    if (unit) {
      const answer = prompt(this.transloco.translate('habits.card.howMuch', { unit }));
      if (answer === null) {
        return;
      }
      const parsed = Number(answer.trim().replace(',', '.'));
      amount = answer.trim() && Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
    }
    this.action.emit({ type: 'mark', day, amount });
  }
}

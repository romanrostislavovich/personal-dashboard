import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  LOCALE_ID,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { addDays, LocalDate, toLocalDate } from '@pd/contracts';

/** A day of the calendar: a number and the text shown on hover (the caller knows the unit). */
export interface HeatmapDay {
  day: LocalDate;
  value: number;
  label: string;
}

interface Cell {
  day: LocalDate;
  level: number;
  title: string;
}

/** Colour steps above zero, like on the GitHub profile. */
const LEVELS = 4;

/**
 * A year like GitHub contributions: a column per week (Monday on top), a cell per day, the more
 * was done the stronger the colour. Steps are relative to the best day of the year.
 */
@Component({
  selector: 'pd-contribution-heatmap',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslocoPipe],
  template: `
    <div class="scroll">
      <div
        class="grid"
        role="img"
        [attr.aria-label]="year()"
        [style.grid-template-columns]="'repeat(' + weeks().length + ', minmax(0, 1fr))'"
      >
        @for (week of weeks(); track $index) {
          <div class="week">
            @for (cell of week; track $index) {
              @if (cell) {
                <span
                  class="cell"
                  [class.today]="cell.day === today()"
                  [attr.data-level]="cell.level"
                  [title]="cell.title"
                ></span>
              } @else {
                <span class="cell blank"></span>
              }
            }
          </div>
        }
      </div>
    </div>
    <div class="legend">
      <span>{{ 'development.heatmap.less' | transloco }}</span>
      @for (level of levels; track level) {
        <span class="cell swatch" [attr.data-level]="level"></span>
      }
      <span>{{ 'development.heatmap.more' | transloco }}</span>
    </div>
  `,
  styles: `
    :host {
      display: block;
    }
    .scroll {
      overflow-x: auto;
      padding-bottom: 4px;
    }
    /* Weeks stretch to the card width; cells stay square. */
    .grid {
      display: grid;
      gap: 3px;
      /* On a phone the year scrolls sideways instead of shrinking cells to dots. */
      min-width: 560px;
      max-width: 1100px;
    }
    .week {
      display: grid;
      grid-template-rows: repeat(7, auto);
      gap: 3px;
      min-width: 0;
    }
    .cell {
      width: 100%;
      min-width: 0;
      aspect-ratio: 1;
      border-radius: 3px;
      background: color-mix(in srgb, var(--mat-sys-on-surface) 7%, transparent);
    }
    .cell.blank {
      background: none;
    }
    .cell[data-level='1'] {
      background: color-mix(in srgb, var(--mat-sys-primary) 30%, transparent);
    }
    .cell[data-level='2'] {
      background: color-mix(in srgb, var(--mat-sys-primary) 55%, transparent);
    }
    .cell[data-level='3'] {
      background: color-mix(in srgb, var(--mat-sys-primary) 78%, transparent);
    }
    .cell[data-level='4'] {
      background: var(--mat-sys-primary);
    }
    .cell.today {
      box-shadow: inset 0 0 0 2px var(--mat-sys-on-surface);
    }
    .legend {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      gap: 4px;
      margin-top: 8px;
      font: 0.75rem / 1 var(--pd-font);
      color: var(--mat-sys-on-surface-variant);
    }
    .swatch {
      width: 11px;
    }
  `,
})
export class ContributionHeatmapComponent {
  readonly year = input.required<number>();
  readonly days = input.required<HeatmapDay[]>();
  readonly today = input<LocalDate | null>(null);

  protected readonly levels = Array.from({ length: LEVELS + 1 }, (_, level) => level);

  private readonly datePipe = new DatePipe(inject(LOCALE_ID));

  /** Weeks of the year; cells outside the year are `null` so the first column starts on Monday. */
  protected readonly weeks = computed(() => {
    const year = this.year();
    const byDay = new Map(this.days().map((day) => [day.day, day]));
    const max = Math.max(0, ...this.days().map((day) => day.value));
    const first = new Date(Date.UTC(year, 0, 1));
    const offset = (first.getUTCDay() + 6) % 7; // Monday = 0
    const cells: (Cell | null)[] = Array.from({ length: offset }, () => null);
    for (let i = 0; ; i++) {
      const parts = addDays({ year, month: 1, day: 1 }, i);
      if (parts.year !== year) {
        break;
      }
      const day = toLocalDate(parts);
      const entry = byDay.get(day);
      const date = this.datePipe.transform(day, 'd MMMM y') ?? day;
      cells.push({
        day,
        level: heatLevel(entry?.value ?? 0, max),
        title: entry ? `${date} — ${entry.label}` : date,
      });
    }
    const weeks: (Cell | null)[][] = [];
    for (let i = 0; i < cells.length; i += 7) {
      weeks.push(cells.slice(i, i + 7));
    }
    return weeks;
  });
}

/** 0 for nothing, then 1–4 by the share of the best day (any activity is at least 1). */
export function heatLevel(value: number, max: number): number {
  if (value <= 0 || max <= 0) {
    return 0;
  }
  return Math.min(LEVELS, Math.max(1, Math.ceil((value / max) * LEVELS)));
}

import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  LOCALE_ID,
  output,
} from '@angular/core';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { addDays, DiaryCalendarDay, LocalDate, toLocalDate } from '@pd/contracts';
import { MOOD_COLOR, MOOD_EMOJI } from './mood';

interface Cell {
  day: LocalDate;
  entry: DiaryCalendarDay | null;
}

/**
 * A year like GitHub contributions: a column per week (Monday on top), a cell per day.
 * Colour = mood (red → grey → green); an entry without mood is tinted with the theme colour.
 */
@Component({
  selector: 'pd-diary-heatmap',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslocoPipe],
  template: `
    <div class="scroll">
      <div
        class="grid"
        role="grid"
        [attr.aria-label]="year()"
        [style.grid-template-columns]="'repeat(' + weeks().length + ', minmax(0, 1fr))'"
      >
        @for (week of weeks(); track $index) {
          <div class="week" role="row">
            @for (cell of week; track $index) {
              @if (cell) {
                <button
                  type="button"
                  role="gridcell"
                  class="cell"
                  [class.has-entry]="cell.entry"
                  [class.selected]="cell.day === selected()"
                  [class.today]="cell.day === today()"
                  [style.background]="cellColor(cell)"
                  [title]="tooltip(cell)"
                  [attr.aria-label]="tooltip(cell)"
                  (click)="daySelect.emit(cell.day)"
                ></button>
              } @else {
                <span class="cell blank"></span>
              }
            }
          </div>
        }
      </div>
    </div>
    <div class="legend">
      <span class="swatch entry"></span>
      <span>{{ 'diary.calendar.noMood' | transloco }}</span>
      @for (mood of moods; track mood) {
        <span class="swatch" [style.background]="moodColor[mood]"></span>
        <span>{{ moodEmoji[mood] }}</span>
      }
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
      padding: 0;
      border: 0;
      border-radius: 3px;
      background: color-mix(in srgb, var(--mat-sys-on-surface) 7%, transparent);
      cursor: pointer;
    }
    .cell.blank {
      background: none;
      cursor: default;
    }
    .cell:hover,
    .cell:focus-visible {
      outline: 2px solid var(--mat-sys-on-surface);
      outline-offset: 1px;
    }
    .cell.today {
      box-shadow: inset 0 0 0 2px var(--mat-sys-primary);
    }
    .cell.selected {
      outline: 2px solid var(--mat-sys-primary);
      outline-offset: 1px;
    }
    .legend {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 6px;
      margin-top: 10px;
      font: 0.75rem / 1 var(--pd-font);
      color: var(--mat-sys-on-surface-variant);
    }
    .swatch {
      width: 11px;
      height: 11px;
      border-radius: 3px;
      margin-left: 6px;
    }
    .swatch.entry {
      margin-left: 0;
      background: color-mix(in srgb, var(--mat-sys-primary) 55%, transparent);
    }
  `,
})
export class DiaryHeatmapComponent {
  readonly year = input.required<number>();
  readonly days = input.required<DiaryCalendarDay[]>();
  readonly selected = input<LocalDate | null>(null);
  readonly today = input<LocalDate | null>(null);
  readonly daySelect = output<LocalDate>();

  protected readonly moods = [1, 2, 3, 4, 5];
  protected readonly moodColor = MOOD_COLOR;
  protected readonly moodEmoji = MOOD_EMOJI;

  /** Weeks of the year; cells outside the year are `null` so the first column starts on Monday. */
  protected readonly weeks = computed(() => {
    const year = this.year();
    const byDay = new Map(this.days().map((entry) => [entry.day, entry]));
    const first = new Date(Date.UTC(year, 0, 1));
    const offset = (first.getUTCDay() + 6) % 7; // Monday = 0
    const cells: (Cell | null)[] = Array.from({ length: offset }, () => null);
    for (let i = 0; ; i++) {
      const parts = addDays({ year, month: 1, day: 1 }, i);
      if (parts.year !== year) {
        break;
      }
      const day = toLocalDate(parts);
      cells.push({ day, entry: byDay.get(day) ?? null });
    }
    const weeks: (Cell | null)[][] = [];
    for (let i = 0; i < cells.length; i += 7) {
      weeks.push(cells.slice(i, i + 7));
    }
    return weeks;
  });

  protected cellColor({ entry }: Cell): string | null {
    if (!entry) {
      return null;
    }
    return entry.mood
      ? MOOD_COLOR[entry.mood]
      : 'color-mix(in srgb, var(--mat-sys-primary) 55%, transparent)';
  }

  private readonly datePipe = new DatePipe(inject(LOCALE_ID));
  private readonly transloco = inject(TranslocoService);

  protected tooltip({ day, entry }: Cell): string {
    const date = this.datePipe.transform(day, 'd MMMM y') ?? day;
    if (!entry) {
      return `${date} — ${this.transloco.translate('diary.calendar.noEntry')}`;
    }
    const words = this.transloco.translate('diary.calendar.words', { count: entry.words });
    return `${date} ${entry.mood ? MOOD_EMOJI[entry.mood] : ''} · ${words}`;
  }
}

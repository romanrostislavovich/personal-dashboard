import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { DotaActivityDay } from '@pd/contracts';

const WEEKS = 53;
const DAY_MS = 24 * 60 * 60 * 1000;

interface Cell {
  day: string;
  matches: number;
  wins: number;
}

/**
 * The last year of matches, a column per week (Monday on top), like the activity calendar on
 * Dotabuff and GitHub. Brighter = more matches.
 */
@Component({
  selector: 'pd-dota-activity',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslocoPipe],
  template: `
    <div class="scroll">
      <div class="grid" [style.grid-template-columns]="'repeat(' + weeks().length + ', 1fr)'">
        @for (week of weeks(); track $index) {
          <div class="week">
            @for (cell of week; track $index) {
              @if (cell) {
                <span
                  class="cell"
                  [style.--level]="level(cell)"
                  [title]="
                    cell.day +
                    ': ' +
                    ('games.dota.activity.day'
                      | transloco: { matches: cell.matches, wins: cell.wins })
                  "
                ></span>
              } @else {
                <span class="cell blank"></span>
              }
            }
          </div>
        }
      </div>
    </div>
    <p class="legend">
      {{ 'games.dota.activity.summary' | transloco: { days: activeDays(), matches: total() } }}
    </p>
  `,
  styles: `
    .scroll {
      overflow-x: auto;
    }
    .grid {
      display: grid;
      gap: 3px;
      min-width: 560px;
    }
    .week {
      display: grid;
      grid-template-rows: repeat(7, 1fr);
      gap: 3px;
    }
    .cell {
      aspect-ratio: 1;
      border-radius: 3px;
      background: color-mix(
        in srgb,
        var(--mat-sys-primary) calc(var(--level, 0) * 100%),
        color-mix(in srgb, var(--mat-sys-on-surface) 7%, transparent)
      );
    }
    .cell.blank {
      background: none;
    }
    .legend {
      margin: 8px 0 0;
      font: var(--mat-sys-body-small);
      color: var(--mat-sys-on-surface-variant);
    }
  `,
})
export class DotaActivityComponent {
  readonly days = input.required<DotaActivityDay[]>();

  protected readonly total = computed(() => this.days().reduce((sum, d) => sum + d.matches, 0));
  protected readonly activeDays = computed(() => this.days().length);
  private readonly busiest = computed(() => Math.max(1, ...this.days().map((d) => d.matches)));

  /** Weeks from the oldest; days before the first Monday and after today are blank. */
  protected readonly weeks = computed(() => {
    const byDay = new Map(this.days().map((d) => [d.day, d]));
    const today = new Date();
    const end = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
    const mondayOffset = (new Date(end).getUTCDay() + 6) % 7;
    const start = end - (mondayOffset + (WEEKS - 1) * 7) * DAY_MS;
    const weeks: (Cell | null)[][] = [];
    for (let w = 0; w < WEEKS; w++) {
      const week: (Cell | null)[] = [];
      for (let d = 0; d < 7; d++) {
        const time = start + (w * 7 + d) * DAY_MS;
        const day = new Date(time).toISOString().slice(0, 10);
        const found = byDay.get(day);
        week.push(
          time > end ? null : { day, matches: found?.matches ?? 0, wins: found?.wins ?? 0 },
        );
      }
      weeks.push(week);
    }
    return weeks;
  });

  /** 0 for no matches, then 0.25…1 by the share of the busiest day. */
  protected level(cell: Cell): number {
    return cell.matches === 0 ? 0 : 0.25 + 0.75 * (cell.matches / this.busiest());
  }
}

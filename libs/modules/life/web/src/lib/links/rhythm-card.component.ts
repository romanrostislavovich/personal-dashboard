import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import {MatButtonToggleModule} from '@angular/material/button-toggle';
import {MatCardModule} from '@angular/material/card';
import {MatIconModule} from '@angular/material/icon';
import {MatSelectModule} from '@angular/material/select';
import {TranslocoPipe, TranslocoService} from '@jsverse/transloco';
import {HourlyInfo, RHYTHM_DAYS, RhythmDays} from '@pd/contracts';
import {LifeApi} from '../life.api';
import {hourlyValue, hourRanges, weekdayNames} from './hours-format';

/** The hours labelled under the grid. */
const LABELLED = [0, 6, 12, 18];

/**
 * The day's rhythm: one hourly number by weekday and hour, as a grid whose colour is the
 * number's own (darker — more), its peaks in words. Calm on purpose: no colours for good or bad.
 */
@Component({
  selector: 'pd-rhythm-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    MatButtonToggleModule,
    MatCardModule,
    MatIconModule,
    MatSelectModule,
    TranslocoPipe,
  ],
  template: `
    <mat-card appearance="outlined">
      <mat-card-header>
        <mat-icon mat-card-avatar>schedule</mat-icon>
        <mat-card-title>{{
          'life.hourly.rhythm.title' | transloco
        }}</mat-card-title>
        <mat-card-subtitle>{{
          'life.hourly.rhythm.hint' | transloco
        }}</mat-card-subtitle>
      </mat-card-header>
      <mat-card-content>
        @if (data.error()) {
          <p class="muted">{{ 'life.hourly.failed' | transloco }}</p>
        } @else if (data.hasValue()) {
          @if (data.value().metrics.length) {
            <div class="controls">
              <mat-form-field subscriptSizing="dynamic">
                <mat-label>{{ 'life.hourly.number' | transloco }}</mat-label>
                <mat-select
                  [value]="data.value().rhythm?.key"
                  (selectionChange)="choose($event.value)"
                >
                  @for (metric of data.value().metrics; track metric.key) {
                    <mat-option [value]="metric.key">{{
                      metric.labelKey | transloco
                    }}</mat-option>
                  }
                </mat-select>
              </mat-form-field>
              <mat-button-toggle-group
                [value]="days()"
                (change)="days.set($event.value)"
                [attr.aria-label]="'life.hourly.period' | transloco"
              >
                @for (option of periods; track option) {
                  <mat-button-toggle [value]="option">{{
                    'life.hourly.days' | transloco: {days: option}
                  }}</mat-button-toggle>
                }
              </mat-button-toggle-group>
            </div>
            @if (data.value().rhythm; as rhythm) {
              <p class="peaks">
                @if (rhythm.peaks.length) {
                  {{
                    'life.hourly.rhythm.peaks'
                      | transloco: {hours: ranges(rhythm.peaks)}
                  }}
                } @else {
                  {{ 'life.hourly.rhythm.flat' | transloco }}
                }
              </p>
              <div
                class="grid"
                role="img"
                [attr.aria-label]="
                  'life.hourly.rhythm.peaks'
                    | transloco: {hours: ranges(rhythm.peaks)}
                "
              >
                @for (row of rhythm.cells; track $index; let day = $index) {
                  <span class="weekday">{{ weekdays()[day] }}</span>
                  @for (cell of row; track $index; let hour = $index) {
                    <span
                      class="cell"
                      [style.background]="shade(cell)"
                      [attr.title]="title(day, hour, cell)"
                    ></span>
                  }
                }
                <span></span>
                @for (hour of hours; track hour) {
                  <span class="hour">{{
                    labelled.includes(hour) ? hour : ''
                  }}</span>
                }
              </div>
              <p class="muted">
                {{ 'life.hourly.seen' | transloco: {days: rhythm.days} }}
              </p>
            }
          } @else {
            <p class="muted">{{ 'life.hourly.none' | transloco }}</p>
          }
        }
      </mat-card-content>
    </mat-card>
  `,
  styles: `
    :host {
      display: block;
    }
    .controls {
      display: flex;
      flex-wrap: wrap;
      gap: 8px 12px;
      align-items: center;
    }
    mat-form-field {
      flex: 1 1 200px;
      min-width: 0;
    }
    .peaks {
      margin: 12px 0 8px;
      font: var(--mat-sys-title-small);
    }
    .grid {
      display: grid;
      grid-template-columns: 2.5em repeat(24, minmax(0, 1fr));
      gap: 2px;
      align-items: center;
    }
    .cell {
      aspect-ratio: 1;
      border-radius: 2px;
      min-width: 0;
    }
    .weekday,
    .hour {
      font: var(--mat-sys-label-small);
      color: var(--mat-sys-on-surface-variant);
      white-space: nowrap;
    }
    .muted {
      margin: 8px 0 0;
      font: var(--mat-sys-body-small);
      color: var(--mat-sys-on-surface-variant);
    }
  `,
})
export class RhythmCardComponent {
  private readonly api = inject(LifeApi);
  private readonly transloco = inject(TranslocoService);

  protected readonly periods = RHYTHM_DAYS;
  protected readonly hours = [...Array(24).keys()];
  protected readonly labelled = LABELLED;
  protected readonly days = signal<RhythmDays>(90);
  private readonly key = signal<string | undefined>(undefined);
  protected readonly data = this.api.rhythm(this.days, this.key);
  protected readonly weekdays = computed(() =>
    weekdayNames(this.transloco.getActiveLang()),
  );
  private readonly metric = computed<HourlyInfo | undefined>(() => {
    const value = this.data.hasValue() ? this.data.value() : null;
    return value?.metrics.find(one => one.key === value.rhythm?.key);
  });
  private readonly max = computed(() => {
    const cells = this.data.hasValue()
      ? (this.data.value().rhythm?.cells.flat() ?? [])
      : [];
    return Math.max(0, ...cells.filter((one): one is number => one !== null));
  });

  constructor() {
    // Looking at a number's rhythm is counted, for the achievements of exploring.
    effect(() => {
      const key = this.metric()?.key;
      if (key) {
        this.api
          .seen({kind: 'rhythm', key})
          .subscribe({error: () => undefined});
      }
    });
  }

  protected choose(key: string): void {
    this.key.set(key);
  }

  protected ranges(peaks: {from: number; to: number}[]): string {
    return hourRanges(peaks);
  }

  /** The number's own colour, darker for more; an hour never seen left blank. */
  protected shade(value: number | null): string {
    if (value === null) {
      return 'transparent';
    }
    const share = this.max() ? value / this.max() : 0;
    return `color-mix(in srgb, var(--mat-sys-primary) ${Math.round(8 + share * 92)}%, var(--mat-sys-surface-container))`;
  }

  protected title(day: number, hour: number, value: number | null): string {
    const metric = this.metric();
    const shown =
      value === null || !metric
        ? '—'
        : hourlyValue(metric, value, this.transloco.getActiveLang(), minutes =>
            this.transloco.translate('life.hourly.minutes', {value: minutes}),
          );
    return `${this.weekdays()[day]} ${hour}:00 — ${shown}`;
  }
}

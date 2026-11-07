import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  linkedSignal,
  signal,
} from '@angular/core';
import {toSignal} from '@angular/core/rxjs-interop';
import {MatButtonToggleModule} from '@angular/material/button-toggle';
import {MatCardModule} from '@angular/material/card';
import {MatIconModule} from '@angular/material/icon';
import {MatProgressBarModule} from '@angular/material/progress-bar';
import {MatSelectModule} from '@angular/material/select';
import {TranslocoPipe, TranslocoService} from '@jsverse/transloco';
import {LinksRhythm, RHYTHM_DAYS, RhythmDays} from '@pd/contracts';
import {LifeApi} from '../life.api';
import {hourlyValue, hourRanges, weekdayNames} from './hours-format';

/** The hours labelled under the grid. */
const LABELLED = [0, 6, 12, 18];

/**
 * The day's rhythm: one hourly number by weekday and hour, as a grid whose colour is the
 * number's own (darker — more), its peaks in words. Calm on purpose: no colours for good or bad.
 * The choice stays while another period or number loads, and after a failed one.
 */
@Component({
  selector: 'pd-rhythm-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    MatButtonToggleModule,
    MatCardModule,
    MatIconModule,
    MatProgressBarModule,
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
        @if (shown(); as value) {
          <div class="controls">
            @if (value.metrics.length) {
              <mat-form-field subscriptSizing="dynamic">
                <mat-label>{{ 'life.hourly.number' | transloco }}</mat-label>
                <mat-select
                  [value]="value.rhythm?.key"
                  (selectionChange)="choose($event.value)"
                >
                  @for (metric of value.metrics; track metric.key) {
                    <mat-option [value]="metric.key">{{
                      metric.labelKey | transloco
                    }}</mat-option>
                  }
                </mat-select>
              </mat-form-field>
            }
            <mat-button-toggle-group
              hideSingleSelectionIndicator
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
        }
        @if (data.isLoading()) {
          <mat-progress-bar mode="indeterminate" />
        }
        @if (data.error()) {
          <p class="muted">{{ 'life.hourly.failed' | transloco }}</p>
        } @else if (shown(); as value) {
          @if (value.rhythm; as rhythm) {
            <p class="peaks">{{ peaks() }}</p>
            <div class="grid" role="img" [attr.aria-label]="peaks()">
              @for (row of cells(); track $index; let day = $index) {
                <span class="weekday">{{ weekdays()[day] }}</span>
                @for (cell of row; track $index) {
                  <span
                    class="cell"
                    [style.background]="cell.background"
                    [attr.title]="cell.title"
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
      margin-bottom: 8px;
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
  private readonly language = toSignal(this.transloco.langChanges$, {
    initialValue: this.transloco.getActiveLang(),
  });

  protected readonly periods = RHYTHM_DAYS;
  protected readonly hours = [...Array(24).keys()];
  protected readonly labelled = LABELLED;
  protected readonly days = signal<RhythmDays>(90);
  private readonly key = signal<string | undefined>(undefined);
  protected readonly data = this.api.rhythm(this.days, this.key);
  /** The last answer, kept while the next loads (the controls do not vanish). */
  protected readonly shown = linkedSignal<
    LinksRhythm | undefined,
    LinksRhythm | undefined
  >({
    source: () => (this.data.hasValue() ? this.data.value() : undefined),
    computation: (value, previous) => value ?? previous?.value,
  });
  protected readonly weekdays = computed(() => weekdayNames(this.language()));

  protected readonly peaks = computed(() => {
    // Read again when the language changes.
    this.language();
    const rhythm = this.shown()?.rhythm;
    return rhythm?.peaks.length
      ? this.transloco.translate('life.hourly.rhythm.peaks', {
          hours: hourRanges(rhythm.peaks),
        })
      : this.transloco.translate('life.hourly.rhythm.flat');
  });

  /** Each cell's colour and its title, made once per answer, not on every check. */
  protected readonly cells = computed(() => {
    const value = this.shown();
    const rhythm = value?.rhythm;
    if (!value || !rhythm) {
      return [];
    }
    const metric = value.metrics.find(one => one.key === rhythm.key);
    const max = Math.max(
      0,
      ...rhythm.cells.flat().filter((one): one is number => one !== null),
    );
    const language = this.language();
    const weekdays = this.weekdays();
    return rhythm.cells.map((row, day) =>
      row.map((cell, hour) => ({
        background:
          cell === null
            ? 'transparent'
            : `color-mix(in srgb, var(--mat-sys-primary) ${Math.round(8 + (max ? cell / max : 0) * 92)}%, var(--mat-sys-surface-container))`,
        title: `${weekdays[day]} ${hour}:00 — ${
          cell === null || !metric
            ? '—'
            : hourlyValue(metric, cell, language, minutes =>
                this.transloco.translate('life.hourly.minutes', {
                  value: minutes,
                }),
              )
        }`,
      })),
    );
  });

  /** A number chosen: its rhythm is read, and looking at it counted (for the achievements). */
  protected choose(key: string): void {
    this.key.set(key);
    this.api.seen({kind: 'rhythm', key}).subscribe({error: () => undefined});
  }
}

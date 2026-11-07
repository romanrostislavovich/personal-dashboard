import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import {MatButtonModule} from '@angular/material/button';
import {MatButtonToggleModule} from '@angular/material/button-toggle';
import {MatCardModule} from '@angular/material/card';
import {MatIconModule} from '@angular/material/icon';
import {TranslocoPipe, TranslocoService} from '@jsverse/transloco';
import {HourAfter, RHYTHM_DAYS, RhythmDays} from '@pd/contracts';
import {LifeApi} from '../life.api';
import {hourlyValue} from './hours-format';

/** The results shown before "show all". */
const SHOWN = 8;

/**
 * The hour after an event: what a number does in the hour after a burst of notifications, a
 * game, a walk… against the same weekday's same hours without it. "Goes with", not "causes";
 * the strong ones first, the rest on a button.
 */
@Component({
  selector: 'pd-hour-after-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    MatButtonModule,
    MatButtonToggleModule,
    MatCardModule,
    MatIconModule,
    TranslocoPipe,
  ],
  template: `
    <mat-card appearance="outlined">
      <mat-card-header>
        <mat-icon mat-card-avatar>update</mat-icon>
        <mat-card-title>{{
          'life.hourly.after.title' | transloco
        }}</mat-card-title>
        <mat-card-subtitle>{{
          'life.hourly.after.hint' | transloco
        }}</mat-card-subtitle>
      </mat-card-header>
      <mat-card-content>
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
        @if (data.error()) {
          <p class="muted">{{ 'life.hourly.failed' | transloco }}</p>
        } @else if (data.hasValue()) {
          @if (!data.value().events.length) {
            <p class="muted">{{ 'life.hourly.after.noEvents' | transloco }}</p>
          } @else {
            @if (!strong().length) {
              <p class="muted">{{ 'life.hourly.after.nothing' | transloco }}</p>
            }
            <ul class="results">
              @for (result of shown(); track result.event + result.outcome) {
                <li [class.weak]="!result.strong">
                  <button
                    type="button"
                    class="row"
                    [attr.aria-expanded]="open() === id(result)"
                    (click)="toggle(result)"
                  >
                    <span class="what">
                      {{ name(result.event) }} →
                      {{ name(result.outcome) }}
                    </span>
                    <b>
                      {{ result.difference > 0 ? '↑' : '↓' }}
                      {{ value(result.outcome, abs(result.difference)) }}
                    </b>
                  </button>
                  @if (open() === id(result)) {
                    <p class="muted">
                      {{
                        'life.hourly.after.detail'
                          | transloco
                            : {
                                after: value(result.outcome, result.after),
                                usual: value(result.outcome, result.usual),
                                events: result.events,
                              }
                      }}
                      @if (!result.strong) {
                        · {{ 'life.hourly.after.unsure' | transloco }}
                      }
                    </p>
                  }
                </li>
              }
            </ul>
            @if (list().length > shownCount()) {
              <button matButton type="button" (click)="all.set(!all())">
                {{
                  (all() ? 'life.hourly.after.less' : 'life.hourly.after.all')
                    | transloco: {count: list().length}
                }}
              </button>
            }
            <p class="muted">{{ 'life.hourly.after.caution' | transloco }}</p>
          }
        }
      </mat-card-content>
    </mat-card>
  `,
  styles: `
    :host {
      display: block;
    }
    .results {
      display: flex;
      flex-direction: column;
      gap: 4px;
      margin: 12px 0 0;
      padding: 0;
      list-style: none;
    }
    .row {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      width: 100%;
      padding: 8px 0;
      border: 0;
      border-bottom: 1px solid var(--pd-border);
      background: none;
      color: inherit;
      font: inherit;
      text-align: start;
      cursor: pointer;
    }
    .what {
      min-width: 0;
      overflow-wrap: anywhere;
    }
    .row b {
      font-variant-numeric: tabular-nums;
      white-space: nowrap;
    }
    .weak .row {
      color: var(--mat-sys-on-surface-variant);
    }
    .muted {
      margin: 8px 0 0;
      font: var(--mat-sys-body-small);
      color: var(--mat-sys-on-surface-variant);
    }
  `,
})
export class HourAfterCardComponent {
  private readonly api = inject(LifeApi);
  private readonly transloco = inject(TranslocoService);

  protected readonly periods = RHYTHM_DAYS;
  protected readonly days = signal<RhythmDays>(90);
  protected readonly data = this.api.hourAfter(this.days);
  protected readonly all = signal(false);
  protected readonly open = signal<string | null>(null);

  protected readonly list = computed(() =>
    this.data.hasValue() ? this.data.value().results : [],
  );
  protected readonly strong = computed(() =>
    this.list().filter(one => one.strong),
  );
  /** The strong ones, else the surest few; everything on "show all". */
  protected readonly shownCount = computed(() =>
    Math.max(SHOWN, this.strong().length),
  );
  protected readonly shown = computed(() =>
    this.all() ? this.list() : this.list().slice(0, this.shownCount()),
  );
  private readonly labels = computed(() => {
    const data = this.data.hasValue() ? this.data.value() : null;
    return new Map<
      string,
      {labelKey: string; unit?: 'minutes' | 'count' | 'score'}
    >([
      ...(data?.events ?? []).map(
        one => [one.key, {labelKey: one.labelKey}] as const,
      ),
      ...(data?.outcomes ?? []).map(
        one => [one.key, {labelKey: one.labelKey, unit: one.unit}] as const,
      ),
    ]);
  });

  protected id(result: HourAfter): string {
    return `${result.event}|${result.outcome}`;
  }

  /** Opens a result; opening the hour after an event is counted (for the achievements). */
  protected toggle(result: HourAfter): void {
    const id = this.id(result);
    if (this.open() === id) {
      this.open.set(null);
      return;
    }
    this.open.set(id);
    this.api
      .seen({kind: 'after', key: result.event})
      .subscribe({error: () => undefined});
  }

  protected name(key: string): string {
    const labelKey = this.labels().get(key)?.labelKey;
    return labelKey ? this.transloco.translate(labelKey) : key;
  }

  protected value(key: string, value: number): string {
    return hourlyValue(
      {unit: this.labels().get(key)?.unit ?? 'count'},
      value,
      this.transloco.getActiveLang(),
      minutes =>
        this.transloco.translate('life.hourly.minutes', {value: minutes}),
    );
  }

  protected abs(value: number): number {
    return Math.abs(value);
  }
}

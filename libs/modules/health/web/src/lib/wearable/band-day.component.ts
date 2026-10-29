import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { TranslocoPipe } from '@jsverse/transloco';
import { Bar, BarChartComponent, SparklineComponent } from '@pd/web-core';
import { HealthApi } from '../health.api';
import { addDays, clock, levelOf, today } from './band-format';
import { BandNightComponent } from './band-night.component';
import { BandReactionsComponent } from './band-reactions.component';

/** The pulse is drawn by 5-minute averages: a day of minutes is too many points to read. */
const PULSE_STEP_MS = 5 * 60_000;

/**
 * Health → Band → Day: the day by hours from the phone's Health Connect — the pulse, the stress
 * index of each hour, steps, exercises, the body's reactions — and the night that ended it.
 */
@Component({
  selector: 'pd-band-day',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DecimalPipe,
    MatButtonModule,
    MatCardModule,
    MatIconModule,
    TranslocoPipe,
    BarChartComponent,
    SparklineComponent,
    BandNightComponent,
    BandReactionsComponent,
  ],
  template: `
    <div class="nav">
      <button
        matIconButton
        (click)="dayChange.emit(shift(-1))"
        [attr.aria-label]="'health.band.day.previous' | transloco"
      >
        <mat-icon>chevron_left</mat-icon>
      </button>
      <span class="date">{{ day() }}</span>
      <button
        matIconButton
        (click)="dayChange.emit(shift(1))"
        [disabled]="day() >= todayDay"
        [attr.aria-label]="'health.band.day.next' | transloco"
      >
        <mat-icon>chevron_right</mat-icon>
      </button>
      @if (day() !== todayDay) {
        <button matButton (click)="dayChange.emit(todayDay)">
          {{ 'health.band.day.today' | transloco }}
        </button>
      }
    </div>

    @if (summary(); as s) {
      <div class="tiles">
        @if (s.stressScore !== null) {
          <div class="tile" [attr.data-level]="level(s.stressScore)">
            <span class="label">{{ 'health.band.fields.stressScore' | transloco }}</span>
            <span class="value">{{ s.stressScore }}</span>
            <span class="note">{{ 'health.band.levels.' + level(s.stressScore) | transloco }}</span>
          </div>
        }
        @if (s.sleepScore !== null) {
          <div class="tile">
            <span class="label">{{ 'health.band.fields.sleepScore' | transloco }}</span>
            <span class="value">{{ s.sleepScore }}</span>
          </div>
        }
        @if (s.resilience !== null) {
          <div class="tile">
            <span class="label">{{ 'health.band.fields.resilience' | transloco }}</span>
            <span class="value">{{ s.resilience }}</span>
          </div>
        }
        @if (s.steps !== null) {
          <div class="tile">
            <span class="label">{{ 'health.band.fields.steps' | transloco }}</span>
            <span class="value">{{ s.steps | number }}</span>
          </div>
        }
        @if (s.heartRateAvg !== null) {
          <div class="tile">
            <span class="label">{{ 'health.band.fields.heartRateAvg' | transloco }}</span>
            <span class="value">{{ s.heartRateAvg }} bpm</span>
          </div>
        }
      </div>
    }

    @if (detail.value(); as d) {
      @if (!d.minutes.length && !d.sleep && !d.hours.length) {
        <p class="hint">{{ 'health.band.day.empty' | transloco }}</p>
      } @else {
        @if (pulse().length) {
          <mat-card appearance="outlined">
            <mat-card-header>
              <mat-card-title>{{ 'health.band.day.pulse' | transloco }}</mat-card-title>
            </mat-card-header>
            <mat-card-content>
              <pd-sparkline
                [points]="pulse()"
                unit=" bpm"
                dateFormat="HH:mm"
                [showAxis]="true"
                [label]="'health.band.day.pulse' | transloco"
              />
            </mat-card-content>
          </mat-card>
        }
        @if (stressBars().length) {
          <mat-card appearance="outlined">
            <mat-card-header>
              <mat-card-title>{{ 'health.band.day.stress' | transloco }}</mat-card-title>
              <mat-card-subtitle>{{ 'health.band.day.stressHint' | transloco }}</mat-card-subtitle>
            </mat-card-header>
            <mat-card-content>
              <pd-bar-chart [bars]="stressBars()" [label]="'health.band.day.stress' | transloco" />
            </mat-card-content>
          </mat-card>
        }
        @if (stepBars().length) {
          <mat-card appearance="outlined">
            <mat-card-header>
              <mat-card-title>{{ 'health.band.day.steps' | transloco }}</mat-card-title>
            </mat-card-header>
            <mat-card-content>
              <pd-bar-chart [bars]="stepBars()" [label]="'health.band.day.steps' | transloco" />
            </mat-card-content>
          </mat-card>
        }

        <pd-band-night [detail]="d" [day]="summary()" />

        <mat-card appearance="outlined">
          <mat-card-header>
            <mat-card-title>{{ 'health.band.reactions.title' | transloco }}</mat-card-title>
            <mat-card-subtitle>{{ 'health.band.reactions.hint' | transloco }}</mat-card-subtitle>
          </mat-card-header>
          <mat-card-content>
            <pd-band-reactions [reactions]="d.reactions" (changed)="detail.reload()" />
          </mat-card-content>
        </mat-card>

        @if (d.exercises.length) {
          <mat-card appearance="outlined">
            <mat-card-header>
              <mat-card-title>{{ 'health.band.day.exercises' | transloco }}</mat-card-title>
            </mat-card-header>
            <mat-card-content>
              @for (exercise of d.exercises; track exercise.id) {
                <p>
                  {{ clock(exercise.startAt) }}–{{ clock(exercise.endAt) }} ·
                  {{ exercise.title ?? ('health.band.day.exercise' | transloco) }}
                </p>
              }
            </mat-card-content>
          </mat-card>
        }
      }
    }
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }
    .nav {
      display: flex;
      align-items: center;
      gap: 4px;
    }
    .date {
      font: var(--mat-sys-title-medium);
      min-width: 7.5em;
      text-align: center;
    }
    .hint {
      color: var(--mat-sys-on-surface-variant);
    }
    .tiles {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
      gap: 12px;
    }
    .tile {
      display: flex;
      flex-direction: column;
      gap: 2px;
      padding: 10px 12px;
      border: 1px solid var(--mat-sys-outline-variant);
      border-radius: 12px;
    }
    .tile[data-level='raised'] {
      border-color: var(--mat-sys-tertiary);
    }
    .tile[data-level='high'] {
      border-color: var(--mat-sys-error);
    }
    .label,
    .note {
      color: var(--mat-sys-on-surface-variant);
      font: var(--mat-sys-label-medium);
    }
    .value {
      font: 700 1.3rem / 1.2 var(--pd-font-heading);
    }
  `,
})
export class BandDayComponent {
  private readonly api = inject(HealthApi);

  readonly day = input.required<string>();
  readonly dayChange = output<string>();

  protected readonly todayDay = today();
  protected readonly clock = clock;
  protected readonly level = levelOf;

  protected readonly detail = this.api.bandDay(computed(() => ({ day: this.day() })));
  private readonly days = this.api.wearableDays(
    computed(() => ({ from: this.day(), to: this.day() })),
  );
  /** The day's numbers: the Google Health API's first, then the phone's, and what is counted. */
  protected readonly summary = computed(() => this.days.value()[0] ?? null);

  protected shift(days: number): string {
    return addDays(this.day(), days);
  }

  protected readonly pulse = computed(() => {
    const buckets = new Map<number, number[]>();
    for (const minute of this.detail.value()?.minutes ?? []) {
      if (minute.bpm !== null) {
        const at = Math.floor(Date.parse(minute.at) / PULSE_STEP_MS) * PULSE_STEP_MS;
        buckets.set(at, [...(buckets.get(at) ?? []), minute.bpm]);
      }
    }
    return [...buckets].map(([at, values]) => ({
      at: new Date(at).toISOString(),
      value: Math.round(values.reduce((a, b) => a + b, 0) / values.length),
    }));
  });

  protected readonly stressBars = computed((): Bar[] =>
    (this.detail.value()?.hours ?? [])
      .filter((hour) => hour.stress !== null)
      .map((hour) => ({
        label: clock(hour.at).slice(0, 2),
        value: hour.stress as number,
        title: `${clock(hour.at)} — ${hour.stress}`,
      })),
  );

  protected readonly stepBars = computed((): Bar[] =>
    (this.detail.value()?.hours ?? [])
      .filter((hour) => hour.steps !== null)
      .map((hour) => ({
        label: clock(hour.at).slice(0, 2),
        value: hour.steps as number,
        title: `${clock(hour.at)} — ${hour.steps}`,
      })),
  );
}

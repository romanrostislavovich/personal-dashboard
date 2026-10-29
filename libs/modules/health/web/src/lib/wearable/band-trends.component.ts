import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { TranslocoPipe } from '@jsverse/transloco';
import { WearableDay } from '@pd/contracts';
import { Bar, BarChartComponent, SparklineComponent } from '@pd/web-core';
import { HealthApi } from '../health.api';
import { addDays, today } from './band-format';

type Field = Exclude<keyof WearableDay, 'day' | 'sleepStart' | 'sleepEnd'>;

interface Tile {
  field: Field;
  icon: string;
  /** Minutes shown as hours; the rest as they are, with this many decimals. */
  as: 'hours' | 0 | 1;
  unit?: string;
}

const TILES: Tile[] = [
  { field: 'sleepScore', icon: 'hotel_class', as: 0 },
  { field: 'stressScore', icon: 'psychology', as: 0 },
  { field: 'resilience', icon: 'shield_with_heart', as: 0 },
  { field: 'sleepMinutes', icon: 'bedtime', as: 'hours' },
  { field: 'deepMinutes', icon: 'nights_stay', as: 'hours' },
  { field: 'remMinutes', icon: 'cloud', as: 'hours' },
  { field: 'restingHeartRate', icon: 'favorite', as: 0, unit: 'bpm' },
  { field: 'hrvMs', icon: 'monitor_heart', as: 0, unit: 'ms' },
  { field: 'spo2', icon: 'spo2', as: 1, unit: '%' },
  { field: 'steps', icon: 'directions_walk', as: 0 },
  { field: 'activeZoneMinutes', icon: 'local_fire_department', as: 0 },
  { field: 'calories', icon: 'bolt', as: 0, unit: 'kcal' },
  { field: 'reactions', icon: 'ecg_heart', as: 1 },
];

/** The lines under the charts: each a number of the period, day by day. */
const LINES: { field: Field; unit: string }[] = [
  { field: 'stressScore', unit: '' },
  { field: 'sleepScore', unit: '' },
  { field: 'restingHeartRate', unit: ' bpm' },
  { field: 'hrvMs', unit: ' ms' },
];

const PERIODS = [7, 30, 90] as const;

/**
 * Health → Band → Trends: the band's days of a period — the averages, sleep and steps per day,
 * the stress, the sleep score, the resting heart rate and HRV as lines. Each average is over the
 * days the band told it; a day it was not worn is left out.
 */
@Component({
  selector: 'pd-band-trends',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DecimalPipe,
    MatButtonToggleModule,
    MatCardModule,
    MatIconModule,
    TranslocoPipe,
    BarChartComponent,
    SparklineComponent,
  ],
  template: `
    <div class="head">
      <mat-button-toggle-group
        [value]="days()"
        (change)="days.set($event.value)"
        [attr.aria-label]="'health.band.period' | transloco"
      >
        @for (n of periods; track n) {
          <mat-button-toggle [value]="n">{{
            'health.band.days' | transloco: { count: n }
          }}</mat-button-toggle>
        }
      </mat-button-toggle-group>
    </div>

    @if (!data.value().length) {
      <p class="hint">{{ 'health.band.noDays' | transloco }}</p>
    } @else {
      <div class="tiles">
        @for (tile of tiles(); track tile.field) {
          <div class="tile">
            <mat-icon>{{ tile.icon }}</mat-icon>
            <span class="label">{{ 'health.band.fields.' + tile.field | transloco }}</span>
            <span class="value">
              @if (tile.as === 'hours') {
                {{ tile.value / 60 | number: '1.1-1' }} {{ 'health.band.h' | transloco }}
              } @else {
                {{ tile.value | number: '1.0-' + tile.as }} {{ tile.unit ?? '' }}
              }
            </span>
            <span class="days">{{ 'health.band.daysTold' | transloco: { count: tile.days } }}</span>
          </div>
        }
      </div>

      <mat-card appearance="outlined">
        <mat-card-header>
          <mat-card-title>{{ 'health.band.charts.sleep' | transloco }}</mat-card-title>
        </mat-card-header>
        <mat-card-content>
          <pd-bar-chart [bars]="sleepBars()" [label]="'health.band.charts.sleep' | transloco" />
        </mat-card-content>
      </mat-card>

      <mat-card appearance="outlined">
        <mat-card-header>
          <mat-card-title>{{ 'health.band.charts.steps' | transloco }}</mat-card-title>
        </mat-card-header>
        <mat-card-content>
          <pd-bar-chart [bars]="stepBars()" [label]="'health.band.charts.steps' | transloco" />
        </mat-card-content>
      </mat-card>

      <div class="lines">
        @for (line of lines(); track line.field) {
          <mat-card appearance="outlined">
            <mat-card-header>
              <mat-card-title>{{ 'health.band.fields.' + line.field | transloco }}</mat-card-title>
            </mat-card-header>
            <mat-card-content>
              <pd-sparkline [points]="line.points" [unit]="line.unit" [showAxis]="true" />
            </mat-card-content>
          </mat-card>
        }
      </div>
    }
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }
    .head {
      display: flex;
      justify-content: flex-end;
    }
    .hint {
      color: var(--mat-sys-on-surface-variant);
    }
    .tiles {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
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
    .label,
    .days {
      color: var(--mat-sys-on-surface-variant);
      font: var(--mat-sys-label-medium);
    }
    .value {
      font: 700 1.3rem / 1.2 var(--pd-font-heading);
    }
    .lines {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
      gap: 16px;
    }
  `,
})
export class BandTrendsComponent {
  private readonly api = inject(HealthApi);

  protected readonly periods = PERIODS;
  protected readonly days = signal<(typeof PERIODS)[number]>(30);
  private readonly period = computed(() => ({
    from: addDays(today(), -this.days() + 1),
    to: today(),
  }));

  protected readonly data = this.api.wearableDays(this.period);

  /** Each number's average over the days it was told; a number never told is left out. */
  protected readonly tiles = computed(() =>
    TILES.flatMap((tile) => {
      const told = this.told(tile.field);
      if (!told.length) {
        return [];
      }
      const value = told.reduce((sum, n) => sum + n, 0) / told.length;
      return [{ ...tile, value, days: told.length }];
    }),
  );

  protected readonly lines = computed(() =>
    LINES.map((line) => ({
      ...line,
      points: this.data.value().flatMap((day) => {
        const value = day[line.field];
        return typeof value === 'number' ? [{ at: day.day, value }] : [];
      }),
    })).filter((line) => line.points.length > 1),
  );

  protected readonly sleepBars = computed(() =>
    this.bars(
      (day) => day.sleepMinutes,
      (minutes) => Math.round((minutes / 60) * 10) / 10,
      'h',
    ),
  );
  protected readonly stepBars = computed(() =>
    this.bars(
      (day) => day.steps,
      (steps) => steps,
      '',
    ),
  );

  private told(field: Field): number[] {
    return this.data
      .value()
      .map((day) => day[field])
      .filter((value): value is number => typeof value === 'number');
  }

  private bars(
    read: (day: WearableDay) => number | null,
    shown: (value: number) => number,
    unit: string,
  ): Bar[] {
    const days = this.data.value();
    const every = Math.ceil(days.length / 10);
    return days.map((day, i) => {
      const value = read(day);
      const number = value === null ? 0 : shown(value);
      return {
        label: i % every === 0 ? day.day.slice(5) : '',
        value: number,
        title: `${day.day} — ${value === null ? '—' : `${number} ${unit}`.trim()}`,
      };
    });
  }
}

import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { WearableDay } from '@pd/contracts';
import { Bar, BarChartComponent, EmptyStateComponent, SparklineComponent } from '@pd/web-core';
import { HealthApi } from '../health.api';

type Field = Exclude<keyof WearableDay, 'day' | 'sleepStart' | 'sleepEnd'>;

interface Tile {
  field: Field;
  icon: string;
  /** Minutes shown as hours; the rest as they are, with this many decimals. */
  as: 'hours' | 0 | 1;
  unit?: string;
}

const TILES: Tile[] = [
  { field: 'sleepMinutes', icon: 'bedtime', as: 'hours' },
  { field: 'deepMinutes', icon: 'nights_stay', as: 'hours' },
  { field: 'remMinutes', icon: 'cloud', as: 'hours' },
  { field: 'restingHeartRate', icon: 'favorite', as: 0, unit: 'bpm' },
  { field: 'hrvMs', icon: 'monitor_heart', as: 0, unit: 'ms' },
  { field: 'spo2', icon: 'spo2', as: 1, unit: '%' },
  { field: 'steps', icon: 'directions_walk', as: 0 },
  { field: 'activeZoneMinutes', icon: 'local_fire_department', as: 0 },
  { field: 'calories', icon: 'bolt', as: 0, unit: 'kcal' },
];

const PERIODS = [7, 30, 90] as const;

function addDays(day: string, days: number): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

const today = () => new Date().toLocaleDateString('sv');

/**
 * Health → Band: the days of the Fitbit through the Google Health API — the averages of the
 * period, sleep and steps per day, the resting heart rate and HRV as lines. Each average is over
 * the days the band told it; a day it was not worn is left out.
 */
@Component({
  selector: 'pd-band-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DecimalPipe,
    MatButtonModule,
    MatButtonToggleModule,
    MatCardModule,
    MatIconModule,
    RouterLink,
    TranslocoPipe,
    BarChartComponent,
    EmptyStateComponent,
    SparklineComponent,
  ],
  template: `
    @if (status.value(); as s) {
      @if (!s.connected) {
        <pd-empty-state
          icon="watch"
          [title]="'health.band.empty.title' | transloco"
          [text]="'health.band.empty.text' | transloco"
        />
        <p class="center">
          <a matButton="filled" routerLink="/settings" [queryParams]="{ tab: 'integrations' }">
            {{ 'health.band.empty.connect' | transloco }}
          </a>
        </p>
      } @else {
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
                <span class="days">{{
                  'health.band.daysTold' | transloco: { count: tile.days }
                }}</span>
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
            <mat-card appearance="outlined">
              <mat-card-header>
                <mat-card-title>{{
                  'health.band.fields.restingHeartRate' | transloco
                }}</mat-card-title>
              </mat-card-header>
              <mat-card-content>
                <pd-sparkline [points]="line('restingHeartRate')" unit=" bpm" [showAxis]="true" />
              </mat-card-content>
            </mat-card>
            <mat-card appearance="outlined">
              <mat-card-header>
                <mat-card-title>{{ 'health.band.fields.hrvMs' | transloco }}</mat-card-title>
              </mat-card-header>
              <mat-card-content>
                <pd-sparkline [points]="line('hrvMs')" unit=" ms" [showAxis]="true" />
              </mat-card-content>
            </mat-card>
          </div>
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
    .head {
      display: flex;
      justify-content: flex-end;
    }
    .center {
      text-align: center;
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
export class BandPage {
  private readonly api = inject(HealthApi);

  protected readonly periods = PERIODS;
  protected readonly days = signal<(typeof PERIODS)[number]>(30);
  private readonly period = computed(() => ({
    from: addDays(today(), -this.days() + 1),
    to: today(),
  }));

  protected readonly status = this.api.wearable();
  protected readonly data = this.api.wearableDays(this.period);

  /** Each number's average over the days it was told; a number never told is left out. */
  protected readonly tiles = computed(() =>
    TILES.flatMap((tile) => {
      const told = this.data
        .value()
        .map((day) => day[tile.field])
        .filter((value): value is number => value !== null);
      if (!told.length) {
        return [];
      }
      const value = told.reduce((sum, n) => sum + n, 0) / told.length;
      return [{ ...tile, value, days: told.length }];
    }),
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

  protected line(field: Field) {
    return this.data.value().flatMap((day) => {
      const value = day[field];
      return value === null ? [] : [{ at: day.day, value }];
    });
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

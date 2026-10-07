import { CurrencyPipe, DecimalPipe } from '@angular/common';
import { httpResource } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { TranslocoPipe } from '@jsverse/transloco';
import { CORE_READS } from '@pd/client-core';
import { MoodInsight, MoodInsights } from '@pd/contracts';

const PERIODS = [90, 180, 365] as const;

function localDate(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * What goes with a good day and what with a bad one: the numbers of every section on the days
 * of a good mood (from the diary) against the days of a bad one.
 */
@Component({
  selector: 'pd-mood-insights',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CurrencyPipe,
    DecimalPipe,
    MatButtonToggleModule,
    MatCardModule,
    MatIconModule,
    TranslocoPipe,
  ],
  template: `
    <mat-card appearance="outlined">
      <mat-card-header>
        <mat-icon mat-card-avatar>mood</mat-icon>
        <mat-card-title>{{ 'life.mood.title' | transloco }}</mat-card-title>
        <mat-card-subtitle>{{ 'life.mood.hint' | transloco }}</mat-card-subtitle>
      </mat-card-header>
      <mat-card-content>
        <mat-button-toggle-group
          hideSingleSelectionIndicator
          [value]="days()"
          [attr.aria-label]="'life.period' | transloco"
          (change)="days.set($event.value)"
        >
          @for (option of periods; track option) {
            <mat-button-toggle [value]="option">
              {{ 'life.mood.days' | transloco: { days: option } }}
            </mat-button-toggle>
          }
        </mat-button-toggle-group>

        @if (insights.value(); as data) {
          @if (!data.enough) {
            <p class="hint">
              {{ 'life.mood.few' | transloco: { good: data.goodDays, bad: data.badDays } }}
            </p>
          } @else {
            <p class="hint">
              {{ 'life.mood.of' | transloco: { good: data.goodDays, bad: data.badDays } }}
            </p>
            <div class="rows">
              <span class="head"></span>
              <span class="head">{{ 'life.mood.good' | transloco }}</span>
              <span class="head">{{ 'life.mood.bad' | transloco }}</span>
              <span class="head"></span>
              @for (item of data.insights; track item.key) {
                <span>{{ item.labelKey | transloco }}</span>
                @for (value of [item.onGoodDays, item.onBadDays]; track $index) {
                  <span class="number">
                    @switch (item.unit) {
                      @case ('money') {
                        {{ value | currency: item.currency : 'symbol' : '1.0-0' }}
                      }
                      @case ('hours') {
                        {{ 'life.hours' | transloco: { value: (value | number: '1.0-1') } }}
                      }
                      @case ('degrees') {
                        {{ value | number: '1.0-1' }}°
                      }
                      @case ('clock') {
                        {{ clock(value) }}
                      }
                      @default {
                        {{ value | number: '1.0-1' }}
                      }
                    }
                  </span>
                }
                <span class="number" [class.more]="item.difference > 0">
                  @if (item.reading) {
                    {{ difference(item) }}
                  } @else {
                    {{ item.differencePercent > 0 ? '+' : '' }}{{ item.differencePercent }}%
                  }
                </span>
              } @empty {
                <span class="hint wide">{{ 'life.mood.same' | transloco }}</span>
              }
            </div>
          }
        }
      </mat-card-content>
    </mat-card>
  `,
  styles: `
    mat-card-content {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: 12px;
      padding-top: 12px;
    }
    .hint {
      margin: 0;
      font: var(--mat-sys-body-small);
      color: var(--mat-sys-on-surface-variant);
    }
    .rows {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto auto auto;
      gap: 6px 16px;
      width: 100%;
      max-width: 560px;
    }
    .head {
      font: var(--mat-sys-label-medium);
      color: var(--mat-sys-on-surface-variant);
      text-align: right;
    }
    .number {
      text-align: right;
      font-variant-numeric: tabular-nums;
    }
    .more {
      color: var(--mat-sys-primary);
    }
    .wide {
      grid-column: 1 / -1;
    }
  `,
})
export class MoodInsightsComponent {
  /** A time of the day out of hours: 23.5 — 23:30, 25 — 01:00 (after midnight). */
  protected clock(hours: number): string {
    const minutes = Math.round(hours * 60) % (24 * 60);
    const pad = (value: number) => String(value).padStart(2, '0');
    return `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
  }

  /** The difference of a reading in its own unit: an hour earlier, three degrees warmer. */
  protected difference(item: MoodInsight): string {
    const sign = item.difference > 0 ? '+' : '−';
    const value = Math.abs(item.difference);
    if (item.unit === 'clock') {
      const minutes = Math.round(value * 60);
      return `${sign}${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}`;
    }
    return `${sign}${Math.round(value * 10) / 10}${item.unit === 'degrees' ? '°' : ''}`;
  }

  protected readonly periods = PERIODS;
  protected readonly days = signal<number>(PERIODS[1]);
  protected readonly insights = httpResource<MoodInsights>(() => {
    const to = new Date();
    const from = new Date(to);
    from.setDate(from.getDate() - this.days() + 1);
    return CORE_READS.moodInsights(localDate(from), localDate(to));
  });
}

import { DecimalPipe } from '@angular/common';
import { httpResource } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { TranslocoPipe } from '@jsverse/transloco';
import { CORE_READS } from '@pd/client-core';
import { MoodForecast } from '@pd/contracts';

/**
 * Today's mood, forecast from yesterday's numbers by a model of the user's own days, and what
 * pulls it up and down. Shown only when the model beat "like the last week" on the latest days.
 */
@Component({
  selector: 'pd-mood-forecast',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DecimalPipe, MatCardModule, MatIconModule, TranslocoPipe],
  template: `
    @if (forecast(); as data) {
      <mat-card appearance="outlined">
        <mat-card-header>
          <mat-icon mat-card-avatar>insights</mat-icon>
          <mat-card-title>{{ 'life.forecast.title' | transloco }}</mat-card-title>
          <mat-card-subtitle>{{ 'life.forecast.hint' | transloco }}</mat-card-subtitle>
        </mat-card-header>
        <mat-card-content>
          @if (data.trusted && data.mood !== null) {
            <p class="mood">
              <span class="value">{{ data.mood | number: '1.1-1' }}</span>
              <span class="of">/ 5</span>
            </p>
            <p class="hint">
              {{
                'life.forecast.quality'
                  | transloco
                    : {
                        days: data.days,
                        error: (data.error | number: '1.1-2'),
                        baseline: (data.baselineError | number: '1.1-2'),
                      }
              }}
            </p>
            <ul>
              @for (driver of data.drivers; track driver.key) {
                <li>
                  <span>{{ driver.label ?? (driver.labelKey | transloco) }}</span>
                  <b [class.up]="driver.effect > 0" [class.down]="driver.effect < 0">
                    {{ driver.effect > 0 ? '↑' : '↓' }} {{ abs(driver.effect) | number: '1.1-2' }}
                  </b>
                </li>
              }
            </ul>
          } @else if (data.days < 40) {
            <p class="hint">{{ 'life.forecast.few' | transloco: { days: data.days } }}</p>
          } @else {
            <p class="hint">{{ 'life.forecast.notBetter' | transloco }}</p>
          }
        </mat-card-content>
      </mat-card>
    }
  `,
  styles: `
    .mood {
      margin: 0;
      display: flex;
      align-items: baseline;
      gap: 6px;
    }
    .value {
      font: var(--mat-sys-display-small);
    }
    .of,
    .hint {
      color: var(--mat-sys-on-surface-variant);
    }
    ul {
      margin: 8px 0 0;
      padding: 0;
      list-style: none;
    }
    li {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      padding: 4px 0;
      border-bottom: 1px solid var(--pd-border);
    }
    .up {
      color: var(--pd-positive, #2e7d32);
    }
    .down {
      color: var(--mat-sys-error);
    }
  `,
})
export class MoodForecastComponent {
  private readonly resource = httpResource<MoodForecast>(() => CORE_READS.moodForecast());

  protected readonly forecast = computed(() =>
    this.resource.hasValue() ? this.resource.value() : null,
  );

  protected abs(value: number): number {
    return Math.abs(value);
  }
}

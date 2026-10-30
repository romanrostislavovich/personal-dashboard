import {DecimalPipe} from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
} from '@angular/core';
import {MatButtonModule} from '@angular/material/button';
import {MatCardModule} from '@angular/material/card';
import {RouterLink} from '@angular/router';
import {TranslocoPipe} from '@jsverse/transloco';
import {HealthApi} from '../health.api';
import {addDays, levelOf, today} from './band-format';

/** Home widget: last night, the stress of today, steps and resilience — from the band. */
@Component({
  selector: 'pd-band-widget',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DecimalPipe,
    MatButtonModule,
    MatCardModule,
    RouterLink,
    TranslocoPipe,
  ],
  template: `
    <mat-card appearance="outlined">
      <mat-card-header>
        <mat-card-title
          >⌚ {{ 'health.band.widget.title' | transloco }}</mat-card-title
        >
      </mat-card-header>
      <mat-card-content>
        @if (day(); as d) {
          <dl>
            @if (d.sleepMinutes !== null) {
              <div>
                <dt>{{ 'health.band.widget.night' | transloco }}</dt>
                <dd>
                  {{ d.sleepMinutes / 60 | number: '1.1-1' }}
                  {{ 'health.band.h' | transloco }}
                  @if (d.sleepScore !== null) {
                    · {{ d.sleepScore }}/100
                  }
                </dd>
              </div>
            }
            @if (d.stressScore !== null) {
              <div>
                <dt>{{ 'health.band.fields.stressScore' | transloco }}</dt>
                <dd>
                  {{ d.stressScore }} ·
                  {{ 'health.band.levels.' + level(d.stressScore) | transloco }}
                </dd>
              </div>
            }
            @if (d.steps !== null) {
              <div>
                <dt>{{ 'health.band.fields.steps' | transloco }}</dt>
                <dd>{{ d.steps | number }}</dd>
              </div>
            }
            @if (d.resilience !== null) {
              <div>
                <dt>{{ 'health.band.fields.resilience' | transloco }}</dt>
                <dd>{{ d.resilience }}</dd>
              </div>
            }
          </dl>
        } @else {
          <p class="empty">{{ 'health.band.widget.empty' | transloco }}</p>
        }
      </mat-card-content>
      <mat-card-actions align="end">
        <a matButton routerLink="/health/band">{{
          'health.band.widget.open' | transloco
        }}</a>
      </mat-card-actions>
    </mat-card>
  `,
  styles: `
    dl {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px 16px;
      margin: 0;
    }
    dt,
    .empty {
      color: var(--mat-sys-on-surface-variant);
      font: var(--mat-sys-label-medium);
    }
    dd {
      margin: 0;
      font: 600 1.05rem / 1.3 var(--pd-font-heading);
    }
  `,
})
export class BandWidget {
  private readonly api = inject(HealthApi);
  protected readonly level = levelOf;

  /** Today, or yesterday early in the morning when today has nothing yet. */
  private readonly days = this.api.wearableDays(
    computed(() => ({from: addDays(today(), -1), to: today()})),
  );
  protected readonly day = computed(() => {
    const days = this.days.value();
    return days.find(d => d.day === today()) ?? days[days.length - 1] ?? null;
  });
}

import { DatePipe } from '@angular/common';
import { httpResource } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatCardModule } from '@angular/material/card';
import { TranslocoPipe } from '@jsverse/transloco';
import { ACTIVITY_READS } from '@pd/client-core';
import { addDays, parseLocalDate, PhoneNotificationsSummary, toLocalDate } from '@pd/contracts';
import { Bar, BarChartComponent, todayLocalDate } from '@pd/web-core';

/** The periods offered, in days. */
const PERIODS = [7, 30] as const;

/**
 * Activity → Notifications: what the other apps of the phone interrupt with (the Android app
 * writes them down once allowed) — how many, from which apps, in which hours, and the latest
 * ones with their text.
 */
@Component({
  selector: 'pd-activity-notifications-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BarChartComponent, DatePipe, MatButtonToggleModule, MatCardModule, TranslocoPipe],
  template: `
    <mat-button-toggle-group
      [value]="days()"
      (change)="days.set($event.value)"
      [attr.aria-label]="'activity.notifications.period' | transloco"
    >
      @for (period of periods; track period) {
        <mat-button-toggle [value]="period">
          {{ 'activity.notifications.days' | transloco: { count: period } }}
        </mat-button-toggle>
      }
    </mat-button-toggle-group>

    @if (summary.value(); as s) {
      @if (s.total === 0) {
        <mat-card appearance="outlined">
          <mat-card-content class="padded">
            <p>{{ 'activity.notifications.none' | transloco }}</p>
          </mat-card-content>
        </mat-card>
      } @else {
        <mat-card appearance="outlined">
          <mat-card-header>
            <mat-card-title>
              {{ 'activity.notifications.total' | transloco: { count: s.total } }}
            </mat-card-title>
            <mat-card-subtitle>{{ 'activity.notifications.byHour' | transloco }}</mat-card-subtitle>
          </mat-card-header>
          <mat-card-content class="padded">
            <pd-bar-chart [bars]="hours()" [label]="'activity.notifications.byHour' | transloco" />
          </mat-card-content>
        </mat-card>

        <mat-card appearance="outlined">
          <mat-card-header>
            <mat-card-title>{{ 'activity.notifications.apps' | transloco }}</mat-card-title>
          </mat-card-header>
          <mat-card-content class="padded">
            @for (app of s.byApp; track app.app) {
              <div class="row">
                <span>{{ app.appName }}</span>
                <span class="count">{{ app.count }}</span>
              </div>
            }
          </mat-card-content>
        </mat-card>

        <mat-card appearance="outlined">
          <mat-card-header>
            <mat-card-title>{{ 'activity.notifications.latest' | transloco }}</mat-card-title>
          </mat-card-header>
          <mat-card-content class="padded">
            @for (item of s.latest; track $index) {
              <div class="item">
                <div class="meta">
                  {{ item.appName }} · {{ item.postedAt | date: 'd MMM, HH:mm' }}
                </div>
                <div class="title">{{ item.title }}</div>
                <div class="text">{{ item.text }}</div>
              </div>
            }
          </mat-card-content>
        </mat-card>
      }
    }
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .padded {
      padding-top: 12px;
    }
    .row {
      display: flex;
      justify-content: space-between;
      padding: 6px 0;
      border-bottom: 1px solid var(--mat-sys-outline-variant);
    }
    .count {
      font-variant-numeric: tabular-nums;
    }
    .item {
      padding: 8px 0;
      border-bottom: 1px solid var(--mat-sys-outline-variant);
    }
    .meta {
      color: var(--mat-sys-on-surface-variant);
      font-size: 0.85rem;
    }
    .title {
      font-weight: 600;
    }
  `,
})
export class NotificationsPage {
  protected readonly periods = PERIODS;
  protected readonly days = signal<number>(7);

  protected readonly summary = httpResource<PhoneNotificationsSummary>(() => {
    const to = todayLocalDate();
    const from = toLocalDate(addDays(parseLocalDate(to), 1 - this.days()));
    return ACTIVITY_READS.phoneNotifications({ from, to });
  });

  protected readonly hours = computed<Bar[]>(() =>
    (this.summary.value()?.byHour ?? []).map((value, hour) => ({
      label: hour % 3 === 0 ? String(hour) : '',
      value,
      title: `${String(hour).padStart(2, '0')}:00 — ${value}`,
    })),
  );
}

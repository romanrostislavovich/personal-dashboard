import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { TranslocoPipe } from '@jsverse/transloco';
import { ActivityDayQuery } from '@pd/contracts';
import { DurationPipe } from '@pd/web-core';
import { joinTimeline, localDay, secondsOf } from '../activity-period';
import { ActivityApi } from '../activity.api';

/** A day can hold hundreds of windows: the first ones are shown, the rest on request. */
const SHOWN_AT_FIRST = 50;

/** What was in front on one day, window by window, newest first. */
@Component({
  selector: 'pd-activity-day-timeline',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, MatButtonModule, MatCardModule, MatIconModule, TranslocoPipe, DurationPipe],
  template: `
    <mat-card appearance="outlined">
      <mat-card-header class="header">
        <mat-card-title>{{ 'activity.timeline.title' | transloco }}</mat-card-title>
        <span class="spacer"></span>
        <button
          matIconButton
          [attr.aria-label]="'activity.timeline.previous' | transloco"
          (click)="shift(-1)"
        >
          <mat-icon>chevron_left</mat-icon>
        </button>
        <input
          type="date"
          [value]="day()"
          [max]="today"
          [attr.aria-label]="'activity.timeline.day' | transloco"
          (change)="pick($any($event.target).value)"
        />
        <button
          matIconButton
          [attr.aria-label]="'activity.timeline.next' | transloco"
          [disabled]="day() >= today"
          (click)="shift(1)"
        >
          <mat-icon>chevron_right</mat-icon>
        </button>
      </mat-card-header>
      <mat-card-content>
        <ul>
          @for (entry of shown(); track entry.startedAt + entry.deviceId) {
            <li>
              <span class="time">
                {{ entry.startedAt | date: 'HH:mm' }}–{{ entry.endedAt | date: 'HH:mm' }}
              </span>
              <span class="what">
                <span class="app">{{ entry.name }}</span>
                @if (entry.title) {
                  <span class="title">{{ entry.title }}</span>
                }
              </span>
              <span class="length">{{ entry.seconds | pdDuration }}</span>
            </li>
          } @empty {
            @if (!timeline.isLoading()) {
              <li class="hint">{{ 'activity.timeline.empty' | transloco }}</li>
            }
          }
        </ul>
        @if (entries().length > shown().length) {
          <button matButton (click)="all.set(true)">
            {{ 'activity.timeline.showAll' | transloco: { count: entries().length } }}
          </button>
        }
      </mat-card-content>
    </mat-card>
  `,
  styles: `
    .header {
      align-items: center;
      gap: 4px;
    }
    .spacer {
      flex: 1;
    }
    input {
      padding: 6px 8px;
      border: 1px solid var(--mat-sys-outline-variant);
      border-radius: 8px;
      background: transparent;
      color: inherit;
      font: inherit;
      color-scheme: inherit;
    }
    ul {
      margin: 8px 0 0;
      padding: 0;
      list-style: none;
    }
    li {
      display: grid;
      grid-template-columns: 96px minmax(0, 1fr) auto;
      gap: 12px;
      padding: 6px 0;
      border-top: 1px solid var(--mat-sys-outline-variant);
      font: var(--mat-sys-body-medium);
    }
    li:first-child {
      border-top: 0;
    }
    .time,
    .length,
    .title,
    .hint {
      color: var(--mat-sys-on-surface-variant);
    }
    .time {
      font-variant-numeric: tabular-nums;
    }
    .what {
      display: flex;
      flex-direction: column;
      min-width: 0;
    }
    .title {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font: var(--mat-sys-body-small);
    }
    .length {
      white-space: nowrap;
    }
    li.hint {
      display: block;
    }
  `,
})
export class DayTimelineComponent {
  private readonly api = inject(ActivityApi);

  /** One device; `null` — all of them. */
  readonly deviceId = input<string | null>(null);

  protected readonly today = localDay();
  protected readonly day = signal(this.today);
  protected readonly all = signal(false);

  private readonly query = computed<ActivityDayQuery>(() => ({
    day: this.day(),
    ...(this.deviceId() ? { deviceId: this.deviceId() as string } : {}),
  }));
  protected readonly timeline = this.api.timeline(this.query);

  protected readonly entries = computed(() =>
    joinTimeline(this.timeline.value()).map((entry) => ({ ...entry, seconds: secondsOf(entry) })),
  );
  protected readonly shown = computed(() =>
    this.all() ? this.entries() : this.entries().slice(0, SHOWN_AT_FIRST),
  );

  protected pick(day: string): void {
    if (/^\d{4}-\d{2}-\d{2}$/.test(day) && day <= this.today) {
      this.day.set(day);
      this.all.set(false);
    }
  }

  protected shift(days: number): void {
    const at = new Date(`${this.day()}T12:00:00`);
    at.setDate(at.getDate() + days);
    this.pick(localDay(at));
  }
}

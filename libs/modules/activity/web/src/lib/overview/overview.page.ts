import { DatePipe, NgTemplateOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  LOCALE_ID,
  signal,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { ActivityPeriod } from '@pd/contracts';
import { Bar, BarChartComponent, DurationPipe, Share, ShareListComponent } from '@pd/web-core';
import { ACTIVITY_PERIODS, ActivityPeriodDays, lastDays } from '../activity-period';
import { ActivityApi } from '../activity.api';
import { DayTimelineComponent } from './day-timeline.component';

/** Bars of the chart: a day each up to a month, then months — a year of days is unreadable. */
const DAILY_BARS_LIMIT = 31;
const TOP_APPS = 15;

/** Time at the computer for a period: totals, days, categories, programs, projects, windows. */
@Component({
  selector: 'pd-activity-overview-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    NgTemplateOutlet,
    MatButtonModule,
    MatButtonToggleModule,
    MatCardModule,
    MatFormFieldModule,
    MatIconModule,
    MatSelectModule,
    RouterLink,
    TranslocoPipe,
    BarChartComponent,
    DurationPipe,
    ShareListComponent,
    DayTimelineComponent,
  ],
  templateUrl: './overview.page.html',
  styleUrl: './overview.page.scss',
})
export class OverviewPage {
  private readonly api = inject(ActivityApi);
  private readonly transloco = inject(TranslocoService);
  private readonly datePipe = new DatePipe(inject(LOCALE_ID));
  private readonly duration = new DurationPipe();

  protected readonly periods = ACTIVITY_PERIODS;
  protected readonly days = signal<ActivityPeriodDays>(7);
  /** One device; `null` — all of them. */
  protected readonly deviceId = signal<string | null>(null);
  protected readonly devices = this.api.devices();

  private readonly period = computed<ActivityPeriod>(() => ({
    ...lastDays(this.days()),
    ...(this.deviceId() ? { deviceId: this.deviceId() as string } : {}),
  }));
  protected readonly stats = this.api.stats(this.period);

  protected readonly activeDays = computed(
    () => (this.stats.value()?.days ?? []).filter((day) => day.seconds > 0).length,
  );
  protected readonly dailyAverage = computed(() =>
    this.activeDays() ? (this.stats.value()?.totalSeconds ?? 0) / this.activeDays() : 0,
  );
  protected readonly bestDay = computed(() => {
    const days = (this.stats.value()?.days ?? []).filter((day) => day.seconds > 0);
    return days.length
      ? days.reduce((best, day) => (day.seconds > best.seconds ? day : best))
      : null;
  });

  protected readonly bars = computed<Bar[]>(() => {
    const days = this.stats.value()?.days ?? [];
    if (days.length <= DAILY_BARS_LIMIT) {
      // A label under every bar fits only for a week.
      const labelEvery = days.length <= 7 ? 1 : 5;
      return days.map(({ day, seconds }, index) => ({
        label: index % labelEvery === 0 ? (this.datePipe.transform(day, 'd MMM') ?? '') : '',
        value: seconds,
        title: `${this.datePipe.transform(day, 'EEEE, d MMMM')} — ${this.duration.transform(seconds)}`,
      }));
    }
    const months = new Map<string, number>();
    for (const { day, seconds } of days) {
      const month = day.slice(0, 7);
      months.set(month, (months.get(month) ?? 0) + seconds);
    }
    return [...months].map(([month, seconds]) => ({
      label: this.datePipe.transform(`${month}-01`, 'LLL') ?? '',
      value: seconds,
      title: `${this.datePipe.transform(`${month}-01`, 'LLLL y')} — ${this.duration.transform(seconds)}`,
    }));
  });

  protected readonly categories = computed(() =>
    this.shares(
      (this.stats.value()?.categories ?? []).map(({ category, seconds }) => ({
        name: this.transloco.translate(`activity.categories.${category}`),
        seconds,
      })),
    ),
  );
  protected readonly apps = computed(() =>
    this.shares((this.stats.value()?.apps ?? []).slice(0, TOP_APPS)),
  );
  protected readonly projects = computed(() => this.shares(this.stats.value()?.projects));
  /** Computers without the tracker whose time another service knows (a work laptop). */
  protected readonly otherComputers = computed(() => this.stats.value()?.otherComputers ?? []);
  protected readonly otherSeconds = computed(() =>
    this.otherComputers().reduce((total, item) => total + item.seconds, 0),
  );
  /** The tracker's computers and the others, the latter named with where their time is from. */
  protected readonly byDevice = computed(() =>
    this.shares([
      ...(this.stats.value()?.devices ?? []),
      ...this.otherComputers().map(({ computer, source, seconds }) => ({
        name: `${computer} · ${this.transloco.translate(`activity.otherComputers.sources.${source}`)}`,
        seconds,
      })),
    ]),
  );
  protected readonly titles = computed(() =>
    this.shares(
      (this.stats.value()?.titles ?? []).map(({ name, title, seconds }) => ({
        name: title ? `${title} · ${name}` : name,
        seconds,
      })),
    ),
  );

  private shares(items: { name: string; seconds: number }[] | undefined): Share[] {
    return (items ?? [])
      .filter((item) => item.seconds > 0)
      .map(({ name, seconds }) => ({
        name,
        value: seconds,
        text: this.duration.transform(seconds),
      }));
  }
}

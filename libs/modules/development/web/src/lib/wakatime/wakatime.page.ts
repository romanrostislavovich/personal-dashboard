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
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { WAKATIME_PERIODS, WakatimePeriod, WakatimeShare } from '@pd/contracts';
import { INTEGRATIONS_LINK } from '@pd/web-core';
import { firstValueFrom } from 'rxjs';
import { Bar, BarChartComponent } from '../ui/bar-chart.component';
import { DurationPipe } from '../ui/duration.pipe';
import { Share, ShareListComponent } from '../ui/share-list.component';
import { WakatimeApi } from './wakatime.api';

/** Bars of the chart: a day each up to a month, then months — a year of days is unreadable. */
const DAILY_BARS_LIMIT = 31;

/** Coding time from WakaTime: today, the chosen period, projects, languages and editors. */
@Component({
  selector: 'pd-wakatime-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    NgTemplateOutlet,
    MatButtonModule,
    MatButtonToggleModule,
    MatCardModule,
    MatIconModule,
    MatProgressBarModule,
    RouterLink,
    TranslocoPipe,
    BarChartComponent,
    DurationPipe,
    ShareListComponent,
  ],
  templateUrl: './wakatime.page.html',
  styleUrl: './wakatime.page.scss',
})
export class WakatimePage {
  private readonly api = inject(WakatimeApi);
  private readonly datePipe = new DatePipe(inject(LOCALE_ID));
  private readonly duration = new DurationPipe();

  protected readonly periods = WAKATIME_PERIODS;
  protected readonly period = signal<WakatimePeriod>(7);
  protected readonly settings = this.api.settings();
  protected readonly stats = this.api.stats(this.period);
  protected readonly busy = signal(false);
  /** The WakaTime key lives in Settings → Integrations (wakatime.integration.ts). */
  protected readonly integrations = INTEGRATIONS_LINK;

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

  protected readonly projects = computed(() => this.shares(this.stats.value()?.projects));
  protected readonly languages = computed(() => this.shares(this.stats.value()?.languages));
  protected readonly editors = computed(() => this.shares(this.stats.value()?.editors));
  protected readonly systems = computed(() => this.shares(this.stats.value()?.operatingSystems));

  async sync(): Promise<void> {
    this.busy.set(true);
    try {
      await firstValueFrom(this.api.sync());
    } finally {
      // A failed sync leaves its error in the settings, shown above the statistics.
      this.settings.reload();
      this.stats.reload();
      this.busy.set(false);
    }
  }

  private shares(items: WakatimeShare[] | undefined): Share[] {
    return (items ?? []).map(({ name, seconds }) => ({
      name,
      value: seconds,
      text: this.duration.transform(seconds),
    }));
  }
}

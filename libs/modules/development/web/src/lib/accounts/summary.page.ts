import { DatePipe, DecimalPipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  LOCALE_ID,
  signal,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { CODE_PROVIDERS } from '@pd/contracts';
import { Bar, BarChartComponent, INTEGRATIONS_LINK, Share, ShareListComponent } from '@pd/web-core';
import { firstValueFrom } from 'rxjs';
import { ContributionHeatmapComponent, HeatmapDay } from '../ui/contribution-heatmap.component';
import { AccountsApi } from './accounts.api';
import { PROVIDER_NAMES } from './providers';

/** The services' own colours — for the shares of a year. */
const PROVIDER_COLORS = { github: '#8b949e', gitlab: '#fc6d26', bitbucket: '#2684ff' };

/**
 * All connected accounts as one: a common calendar where a day counts what was done on GitHub,
 * GitLab and Bitbucket together, its streak, and how much each service gave.
 */
@Component({
  selector: 'pd-accounts-summary-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    DecimalPipe,
    MatButtonModule,
    MatCardModule,
    MatChipsModule,
    MatIconModule,
    MatProgressBarModule,
    RouterLink,
    TranslocoPipe,
    BarChartComponent,
    ContributionHeatmapComponent,
    ShareListComponent,
  ],
  templateUrl: './summary.page.html',
  styleUrl: './account.page.scss',
})
export class SummaryPage {
  private readonly api = inject(AccountsApi);
  private readonly transloco = inject(TranslocoService);
  private readonly datePipe = new DatePipe(inject(LOCALE_ID));

  protected readonly summary = this.api.summary();
  protected readonly busy = signal(false);
  protected readonly integrations = INTEGRATIONS_LINK;
  protected readonly names = PROVIDER_NAMES;

  /** The year of the calendar; the current one until the user picks another. */
  private readonly pickedYear = signal<number | null>(null);
  protected readonly year = computed(() => this.pickedYear() ?? new Date().getFullYear());
  protected readonly contributions = this.api.summaryContributions(this.year);
  protected readonly today = new Date().toLocaleDateString('en-CA');

  protected readonly yearTotals = computed(
    () => this.summary.value()?.years.find((totals) => totals.year === this.year()) ?? null,
  );

  /** How much of the chosen year each service gave. */
  protected readonly shares = computed<Share[]>(() => {
    const totals = this.yearTotals();
    if (!totals) {
      return [];
    }
    return CODE_PROVIDERS.flatMap((provider) => {
      const value = totals.byProvider[provider];
      return value === undefined
        ? []
        : [
            {
              name: PROVIDER_NAMES[provider],
              color: PROVIDER_COLORS[provider],
              value,
              text: `${value} · ${((value / (totals.contributions || 1)) * 100).toFixed(0)}%`,
            },
          ];
    });
  });

  protected readonly heatmapDays = computed<HeatmapDay[]>(() =>
    this.contributions.value().map(({ day, count }) => ({
      day,
      value: count,
      label: this.transloco.translate('development.account.contributionsCount', { count }),
    })),
  );

  /** Contributions per month of the chosen year. */
  protected readonly months = computed<Bar[]>(() => {
    const totals = Array.from({ length: 12 }, () => 0);
    for (const { day, count } of this.contributions.value()) {
      totals[Number(day.slice(5, 7)) - 1] += count;
    }
    return totals.map((value, month) => {
      const date = new Date(this.year(), month, 1);
      return {
        label: this.datePipe.transform(date, 'LLL') ?? '',
        value,
        title: `${this.datePipe.transform(date, 'LLLL y')} — ${value}`,
      };
    });
  });

  protected pickYear(year: number | undefined): void {
    if (year) {
      this.pickedYear.set(year);
    }
  }

  /** Refreshes every connected account; one failing does not stop the others. */
  async syncAll(): Promise<void> {
    this.busy.set(true);
    try {
      for (const { provider } of this.summary.value()?.accounts ?? []) {
        // The error is saved with the account and shown on its card.
        await firstValueFrom(this.api.sync(provider)).catch(() => undefined);
      }
    } finally {
      this.summary.reload();
      this.contributions.reload();
      this.busy.set(false);
    }
  }
}

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
import { MatSnackBar } from '@angular/material/snack-bar';
import { RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { errorBody, INTEGRATIONS_LINK, SparklineComponent } from '@pd/web-core';
import { firstValueFrom } from 'rxjs';
import { Bar, BarChartComponent } from '../ui/bar-chart.component';
import { ContributionHeatmapComponent, HeatmapDay } from '../ui/contribution-heatmap.component';
import { Share, ShareListComponent } from '../ui/share-list.component';
import { GithubApi } from './github.api';

/** The GitHub account of the token's owner: contributions, streaks, languages, repositories. */
@Component({
  selector: 'pd-github-profile-page',
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
    SparklineComponent,
    BarChartComponent,
    ContributionHeatmapComponent,
    ShareListComponent,
  ],
  templateUrl: './github-profile.page.html',
  styleUrl: './github-profile.page.scss',
})
export class GithubProfilePage {
  private readonly api = inject(GithubApi);
  private readonly snackBar = inject(MatSnackBar);
  private readonly transloco = inject(TranslocoService);
  private readonly datePipe = new DatePipe(inject(LOCALE_ID));

  protected readonly settings = this.api.settings();
  protected readonly profile = this.api.profile();
  protected readonly busy = signal(false);
  /** The GitHub token lives in Settings → Integrations (github-token.integration.ts). */
  protected readonly integrations = INTEGRATIONS_LINK;

  /** The year of the calendar; the current one until the user picks another. */
  private readonly pickedYear = signal<number | null>(null);
  protected readonly year = computed(() => this.pickedYear() ?? new Date().getFullYear());
  protected readonly contributions = this.api.contributions(this.year);
  protected readonly today = new Date().toLocaleDateString('en-CA');

  protected readonly yearTotals = computed(
    () => this.profile.value()?.years.find((totals) => totals.year === this.year()) ?? null,
  );

  protected readonly heatmapDays = computed<HeatmapDay[]>(() =>
    this.contributions.value().map(({ day, count }) => ({
      day,
      value: count,
      label: this.transloco.translate('development.github.contributionsCount', { count }),
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

  protected readonly languages = computed<Share[]>(() => {
    const languages = this.profile.value()?.languages ?? [];
    const total = languages.reduce((sum, language) => sum + language.bytes, 0) || 1;
    return languages.map(({ name, color, bytes }) => ({
      name,
      color,
      value: bytes,
      text: `${((bytes / total) * 100).toFixed(1)}%`,
    }));
  });

  protected readonly followersHistory = computed(() =>
    (this.profile.value()?.followersHistory ?? []).map(({ day, followers }) => ({
      at: day,
      value: followers,
    })),
  );

  protected pickYear(year: number | undefined): void {
    if (year) {
      this.pickedYear.set(year);
    }
  }

  async sync(): Promise<void> {
    this.busy.set(true);
    try {
      await firstValueFrom(this.api.syncProfile());
    } catch (error) {
      // GitHub explains itself (an invalid token, a missing permission) — show its words.
      const message = (errorBody(error) as { message?: string } | null)?.message;
      this.snackBar.open(message ?? this.transloco.translate('development.errors.generic'), 'OK', {
        duration: 8000,
      });
    } finally {
      this.profile.reload();
      this.contributions.reload();
      this.busy.set(false);
    }
  }
}

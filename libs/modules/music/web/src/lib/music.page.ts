import { DatePipe, DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { MUSIC_TOP_PERIODS, MusicTopPeriod } from '@pd/contracts';
import { INTEGRATIONS_LINK, SparklineComponent } from '@pd/web-core';
import { interval } from 'rxjs';
import { MusicApi } from './music.api';
import { NowPlayingComponent } from './now-playing.component';
import { TopListComponent } from './top-list.component';

/** "Now playing" changes often — refresh every 30 seconds while the page is open. */
const NOW_PLAYING_REFRESH_MS = 30_000;

@Component({
  selector: 'pd-music-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    DecimalPipe,
    MatButtonModule,
    MatCardModule,
    MatButtonToggleModule,
    RouterLink,
    TranslocoPipe,
    SparklineComponent,
    NowPlayingComponent,
    TopListComponent,
  ],
  templateUrl: './music.page.html',
  styleUrl: './music.page.scss',
})
export class MusicPage {
  private readonly api = inject(MusicApi);

  /** Last.fm and Spotify are connected in Settings → Integrations (music.integration.ts). */
  protected readonly integrations = INTEGRATIONS_LINK;
  protected readonly periods = MUSIC_TOP_PERIODS;
  protected readonly period = signal<MusicTopPeriod>('7day');

  protected readonly settings = this.api.settings();
  protected readonly stats = this.api.stats();
  protected readonly tops = this.api.tops(this.period);
  protected readonly nowPlaying = this.api.nowPlaying();

  protected readonly hasSource = computed(() => {
    const settings = this.settings.value();
    return Boolean(settings?.lastfm.username || settings?.spotify.connected);
  });

  protected readonly playsPoints = computed(
    () => this.stats.value()?.playsByDay.map((p) => ({ at: p.day, value: p.plays })) ?? [],
  );

  constructor() {
    interval(NOW_PLAYING_REFRESH_MS)
      .pipe(takeUntilDestroyed())
      .subscribe(() => this.nowPlaying.reload());
  }
}

import { DatePipe, DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatCardModule } from '@angular/material/card';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { MUSIC_TOP_PERIODS, MusicTopPeriod } from '@pd/contracts';
import { SparklineComponent } from '@pd/web-core';
import { interval } from 'rxjs';
import { MusicApi } from './music.api';
import { MusicConnectComponent } from './music-connect.component';
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
    MatCardModule,
    MatButtonToggleModule,
    TranslocoPipe,
    SparklineComponent,
    MusicConnectComponent,
    NowPlayingComponent,
    TopListComponent,
  ],
  templateUrl: './music.page.html',
  styleUrl: './music.page.scss',
})
export class MusicPage {
  private readonly api = inject(MusicApi);

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
    this.showSpotifyResult();
  }

  onSourcesChanged(): void {
    this.settings.reload();
    this.stats.reload();
    this.tops.reload();
    this.nowPlaying.reload();
  }

  /** After Spotify sign-in we are sent back to /music?spotify=connected|error. */
  private showSpotifyResult(): void {
    const route = inject(ActivatedRoute);
    const router = inject(Router);
    const snackBar = inject(MatSnackBar);
    const transloco = inject(TranslocoService);
    const result = route.snapshot.queryParamMap.get('spotify');
    if (result) {
      snackBar.open(transloco.translate(`music.connect.spotify.${result}`), 'OK', {
        duration: 5000,
      });
      // Remove the parameter from the URL so the message does not repeat on reload.
      router.navigate([], { queryParams: {}, replaceUrl: true });
    }
  }
}

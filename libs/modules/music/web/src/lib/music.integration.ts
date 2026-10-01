import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslocoService } from '@jsverse/transloco';
import { interval } from 'rxjs';
import { MusicApi } from './music.api';
import { MusicConnectComponent } from './music-connect.component';

const HISTORY_REFRESH_MS = 5_000;

/**
 * Last.fm and Spotify, in Settings → Integrations (see `integrations` in music.module.ts).
 * Spotify sign-in comes back here with `?spotify=connected|error`.
 */
@Component({
  selector: 'pd-music-integration',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MusicConnectComponent],
  template: `
    @if (settings.value(); as s) {
      <pd-music-connect [settings]="s" (changed)="settings.reload()" />
    }
  `,
})
export class MusicIntegration {
  protected readonly settings = inject(MusicApi).settings();

  constructor() {
    // While the history import runs, show its progress.
    interval(HISTORY_REFRESH_MS)
      .pipe(takeUntilDestroyed())
      .subscribe(() => {
        if (this.settings.value()?.lastfm.history?.running) {
          this.settings.reload();
        }
      });
    this.showSpotifyResult();
  }

  private showSpotifyResult(): void {
    const route = inject(ActivatedRoute);
    const result = route.snapshot.queryParamMap.get('spotify');
    if (result) {
      inject(MatSnackBar).open(
        inject(TranslocoService).translate(`music.connect.spotify.${result}`),
        'OK',
        { duration: 5000 },
      );
      // Remove the parameter so the message does not repeat on reload; the tab stays.
      void inject(Router).navigate([], {
        queryParams: { spotify: null },
        queryParamsHandling: 'merge',
        replaceUrl: true,
      });
    }
  }
}

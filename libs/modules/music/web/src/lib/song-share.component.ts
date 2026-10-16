import { Clipboard } from '@angular/cdk/clipboard';
import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { musicApi } from '@pd/client-core';
import { SongLinks, songLinks } from '@pd/contracts';
import { DASHBOARD_CLIENT } from '@pd/web-core';

/**
 * "Share" of a song: open it in YouTube Music or Spotify, copy its link there, or send it
 * through the system's share sheet (a phone, Windows) where there is one. The links go
 * straight to the song when the server finds it on the service, to its search otherwise.
 */
@Component({
  selector: 'pd-song-share',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, MatIconModule, MatMenuModule, MatTooltipModule, TranslocoPipe],
  template: `
    <button
      matIconButton
      class="share"
      [matMenuTriggerFor]="menu"
      (menuOpened)="resolve()"
      [matTooltip]="'music.share.title' | transloco"
      [attr.aria-label]="'music.share.title' | transloco"
    >
      <mat-icon>share</mat-icon>
    </button>
    <mat-menu #menu="matMenu">
      @let found = links();
      @if (finding()) {
        <div class="finding">{{ 'music.share.finding' | transloco }}</div>
      }
      <a
        mat-menu-item
        [href]="found.youtubeMusic"
        target="_blank"
        rel="noopener"
        [disabled]="finding()"
      >
        <mat-icon>smart_display</mat-icon> {{ 'music.share.openYoutube' | transloco }}
        @if (!finding() && !found.youtubeMusicExact) {
          <span class="search">{{ 'music.share.search' | transloco }}</span>
        }
      </a>
      <a mat-menu-item [href]="found.spotify" target="_blank" rel="noopener" [disabled]="finding()">
        <mat-icon>graphic_eq</mat-icon> {{ 'music.share.openSpotify' | transloco }}
        @if (!finding() && !found.spotifyExact) {
          <span class="search">{{ 'music.share.search' | transloco }}</span>
        }
      </a>
      <button mat-menu-item [disabled]="finding()" (click)="copy(found.youtubeMusic)">
        <mat-icon>link</mat-icon> {{ 'music.share.copyYoutube' | transloco }}
      </button>
      <button mat-menu-item [disabled]="finding()" (click)="copy(found.spotify)">
        <mat-icon>link</mat-icon> {{ 'music.share.copySpotify' | transloco }}
      </button>
      @if (canShare) {
        <button mat-menu-item [disabled]="finding()" (click)="share()">
          <mat-icon>ios_share</mat-icon> {{ 'music.share.send' | transloco }}
        </button>
      }
    </mat-menu>
  `,
  styles: `
    .share {
      flex-shrink: 0;
    }
    .finding {
      padding: 8px 16px;
      color: var(--mat-sys-on-surface-variant);
      font: var(--mat-sys-body-small);
    }
    .search {
      margin-left: 6px;
      color: var(--mat-sys-on-surface-variant);
      font: var(--mat-sys-body-small);
    }
  `,
})
export class SongShareComponent {
  private readonly clipboard = inject(Clipboard);
  private readonly snackBar = inject(MatSnackBar);
  private readonly transloco = inject(TranslocoService);
  private readonly music = musicApi(inject(DASHBOARD_CLIENT).api);

  readonly track = input.required<string>();
  readonly artist = input<string | null>(null);
  /** A link of the song known already (Spotify's, for the one playing). */
  readonly url = input<string | null>(null);

  /** Found on the server: straight to the song where it could be found. */
  private readonly found = signal<SongLinks | null>(null);
  protected readonly finding = signal(false);
  /** Until the server answers (or when it cannot), links to the search of each service. */
  protected readonly links = computed(
    () =>
      this.found() ?? songLinks({ track: this.track(), artist: this.artist(), url: this.url() }),
  );

  /** The song is looked for when the menu opens: a list of songs costs nothing until then. */
  protected async resolve(): Promise<void> {
    if (this.found() || this.finding()) {
      return;
    }
    this.finding.set(true);
    try {
      this.found.set(
        await this.music.songLinks({
          track: this.track(),
          ...(this.artist() ? { artist: this.artist() as string } : {}),
          ...(this.url() ? { url: this.url() as string } : {}),
        }),
      );
    } catch {
      // The search links stay.
    } finally {
      this.finding.set(false);
    }
  }
  protected readonly canShare = typeof navigator !== 'undefined' && 'share' in navigator;

  protected copy(link: string): void {
    this.clipboard.copy(link);
    this.snackBar.open(this.transloco.translate('music.share.copied'), undefined, {
      duration: 2000,
    });
  }

  /** The song as text with both links: the one who gets it picks their service. */
  protected async share(): Promise<void> {
    const title = [this.artist(), this.track()].filter(Boolean).join(' — ');
    const { youtubeMusic, spotify } = this.links();
    await navigator
      .share({ title, text: `${title}\nYouTube Music: ${youtubeMusic}\nSpotify: ${spotify}` })
      .catch(() => undefined);
  }
}

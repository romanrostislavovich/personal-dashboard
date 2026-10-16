import { Clipboard } from '@angular/cdk/clipboard';
import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { songLinks } from '@pd/contracts';

/**
 * "Share" of a song: open it in YouTube Music or Spotify, copy its link there, or send it
 * through the system's share sheet (a phone, Windows) where there is one.
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
      [matTooltip]="'music.share.title' | transloco"
      [attr.aria-label]="'music.share.title' | transloco"
    >
      <mat-icon>share</mat-icon>
    </button>
    <mat-menu #menu="matMenu">
      <a mat-menu-item [href]="links().youtubeMusic" target="_blank" rel="noopener">
        <mat-icon>smart_display</mat-icon> {{ 'music.share.openYoutube' | transloco }}
      </a>
      <a mat-menu-item [href]="links().spotify" target="_blank" rel="noopener">
        <mat-icon>graphic_eq</mat-icon> {{ 'music.share.openSpotify' | transloco }}
      </a>
      <button mat-menu-item (click)="copy(links().youtubeMusic)">
        <mat-icon>link</mat-icon> {{ 'music.share.copyYoutube' | transloco }}
      </button>
      <button mat-menu-item (click)="copy(links().spotify)">
        <mat-icon>link</mat-icon> {{ 'music.share.copySpotify' | transloco }}
      </button>
      @if (canShare) {
        <button mat-menu-item (click)="share()">
          <mat-icon>ios_share</mat-icon> {{ 'music.share.send' | transloco }}
        </button>
      }
    </mat-menu>
  `,
  styles: `
    .share {
      flex-shrink: 0;
    }
  `,
})
export class SongShareComponent {
  private readonly clipboard = inject(Clipboard);
  private readonly snackBar = inject(MatSnackBar);
  private readonly transloco = inject(TranslocoService);

  readonly track = input.required<string>();
  readonly artist = input<string | null>(null);
  /** A link of the song known already (Spotify's, for the one playing). */
  readonly url = input<string | null>(null);

  protected readonly links = computed(() =>
    songLinks({ track: this.track(), artist: this.artist(), url: this.url() }),
  );
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

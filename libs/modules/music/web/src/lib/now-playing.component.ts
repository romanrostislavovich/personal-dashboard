import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { TranslocoPipe } from '@jsverse/transloco';
import { NowPlaying } from '@pd/contracts';

/** Current track card: cover, title, artist and (for Spotify) progress. */
@Component({
  selector: 'pd-now-playing',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatIconModule, MatProgressBarModule, TranslocoPipe],
  template: `
    @let t = track();
    <div class="now">
      @if (t.imageUrl) {
        <img class="cover" [src]="t.imageUrl" alt="" />
      } @else {
        <div class="cover placeholder"><mat-icon>music_note</mat-icon></div>
      }
      <div class="info">
        <span class="label">
          <mat-icon inline>{{ t.isPlaying ? 'equalizer' : 'pause' }}</mat-icon>
          {{ (t.isPlaying ? 'music.now.playing' : 'music.now.paused') | transloco }}
          · {{ t.source === 'spotify' ? 'Spotify' : 'Last.fm' }}
        </span>
        @if (t.url) {
          <a class="track" [href]="t.url" target="_blank" rel="noopener">{{ t.track }}</a>
        } @else {
          <span class="track">{{ t.track }}</span>
        }
        <span class="artist"
          >{{ t.artist }}
          @if (t.album) {
            · {{ t.album }}
          }
        </span>
        @if (progress() !== null) {
          <mat-progress-bar mode="determinate" [value]="progress()" />
        }
      </div>
    </div>
  `,
  styles: `
    .now {
      display: flex;
      gap: 16px;
      align-items: center;
    }
    .cover {
      width: 88px;
      height: 88px;
      border-radius: 8px;
      object-fit: cover;
      flex-shrink: 0;
    }
    .placeholder {
      display: grid;
      place-items: center;
      background: var(--mat-sys-surface-container-high);
      color: var(--mat-sys-on-surface-variant);
    }
    .info {
      display: flex;
      flex-direction: column;
      gap: 4px;
      min-width: 0;
      flex: 1;
    }
    .label {
      display: flex;
      align-items: center;
      gap: 4px;
      font: var(--mat-sys-label-medium);
      color: var(--mat-sys-primary);
    }
    .track {
      font: var(--mat-sys-title-medium);
      color: inherit;
      text-decoration: none;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .artist {
      font: var(--mat-sys-body-medium);
      color: var(--mat-sys-on-surface-variant);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    mat-progress-bar {
      margin-top: 6px;
    }
  `,
})
export class NowPlayingComponent {
  readonly track = input.required<NowPlaying>();

  /** Percentage played — only if the source knows the progress (Spotify). */
  protected readonly progress = computed(() => {
    const { progressMs, durationMs } = this.track();
    return progressMs !== null && durationMs ? (progressMs / durationMs) * 100 : null;
  });
}

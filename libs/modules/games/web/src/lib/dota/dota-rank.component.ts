import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';

const ICONS = 'https://www.opendota.com/assets/images/dota2/rank_icons';

/** Dota 2 medal with stars (images from OpenDota) and a caption. */
@Component({
  selector: 'pd-dota-rank',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslocoPipe],
  template: `
    <div class="rank">
      <div class="medal">
        <img [src]="icon()" alt="" />
        @if (stars()) {
          <img class="stars" [src]="starsIcon()" alt="" />
        }
      </div>
      <div class="text">
        <span class="name">
          {{ 'games.dota.medals.' + medal() | transloco }}
          @if (stars()) {
            {{ stars() }}
          }
        </span>
        @if (leaderboardRank()) {
          <span class="lb"
            >#{{ leaderboardRank() }} {{ 'games.dota.leaderboard' | transloco }}</span
          >
        }
      </div>
    </div>
  `,
  styles: `
    .rank {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .medal {
      position: relative;
      width: 56px;
      height: 56px;
    }
    .medal img {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
    }
    .text {
      display: flex;
      flex-direction: column;
    }
    .name {
      font: var(--mat-sys-title-small);
    }
    .lb {
      font: var(--mat-sys-label-medium);
      color: var(--mat-sys-on-surface-variant);
    }
  `,
})
export class DotaRankComponent {
  /** `rank_tier`: medal × 10 + stars; null — unranked. */
  readonly rankTier = input.required<number | null>();
  readonly leaderboardRank = input<number | null>(null);

  protected readonly medal = computed(() => Math.floor((this.rankTier() ?? 0) / 10));
  protected readonly stars = computed(() => (this.rankTier() ?? 0) % 10);
  protected readonly icon = computed(() => `${ICONS}/rank_icon_${this.medal()}.png`);
  protected readonly starsIcon = computed(() => `${ICONS}/rank_star_${this.stars()}.png`);
}

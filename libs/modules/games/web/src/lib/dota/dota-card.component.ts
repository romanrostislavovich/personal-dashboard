import { DatePipe, DecimalPipe, PercentPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { TranslocoPipe } from '@jsverse/transloco';
import { DotaSummary } from '@pd/contracts';
import { DotaRankComponent } from './dota-rank.component';

/** Dota 2: профиль, медаль, винрейт за 30 дней, последние матчи и любимые герои. */
@Component({
  selector: 'pd-dota-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, DecimalPipe, PercentPipe, MatIconModule, TranslocoPipe, DotaRankComponent],
  template: `
    @let s = summary();
    <div class="head">
      @if (s.avatarUrl) {
        <img class="avatar" [src]="s.avatarUrl" alt="" />
      }
      <div class="who">
        <a class="name" [href]="s.profileUrl" target="_blank" rel="noopener">{{ s.personaName }}</a>
        <span class="muted">Dota 2</span>
      </div>
      <pd-dota-rank [rankTier]="s.rankTier" [leaderboardRank]="s.leaderboardRank" />
    </div>

    <div class="stats">
      <div class="stat">
        <span class="label">{{ 'games.dota.last30' | transloco }}</span>
        <span class="value">
          <span class="win">{{ s.last30Days.wins }}</span> –
          <span class="loss">{{ s.last30Days.losses }}</span>
        </span>
      </div>
      <div class="stat">
        <span class="label">{{ 'games.dota.winrate' | transloco }}</span>
        <span class="value">{{ winrate() === null ? '—' : (winrate() | percent) }}</span>
      </div>
    </div>

    <h4 class="section">{{ 'games.dota.recentMatches' | transloco }}</h4>
    <ul class="matches">
      @for (m of s.recentMatches; track m.matchId) {
        <li>
          <img class="hero" [src]="m.hero.imageUrl" [alt]="m.hero.name" [title]="m.hero.name" />
          <span class="result" [class.won]="m.won">
            <mat-icon inline>{{ m.won ? 'check' : 'close' }}</mat-icon>
            {{ (m.won ? 'games.dota.win' : 'games.dota.loss') | transloco }}
          </span>
          <span class="kda">{{ m.kills }}/{{ m.deaths }}/{{ m.assists }}</span>
          <span class="muted"
            >{{ m.durationSec / 60 | number: '1.0-0' }} {{ 'games.minutes' | transloco }}</span
          >
          <a
            class="muted date"
            [href]="'https://www.opendota.com/matches/' + m.matchId"
            target="_blank"
            rel="noopener"
            >{{ m.startedAt | date: 'd MMM' }}</a
          >
        </li>
      } @empty {
        <li class="muted">{{ 'games.dota.noMatches' | transloco }}</li>
      }
    </ul>

    @if (s.topHeroes.length) {
      <h4 class="section">{{ 'games.dota.topHeroes' | transloco }}</h4>
      <div class="heroes">
        @for (h of s.topHeroes; track h.hero.id) {
          <div class="top-hero" [title]="h.hero.name">
            <img [src]="h.hero.imageUrl" [alt]="h.hero.name" />
            <span>{{ h.games }} · {{ h.wins / h.games | percent }}</span>
          </div>
        }
      </div>
    }
  `,
  styles: `
    .head {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .avatar {
      width: 56px;
      height: 56px;
      border-radius: 8px;
    }
    .who {
      display: flex;
      flex-direction: column;
      flex: 1;
      min-width: 0;
    }
    .name {
      font: var(--mat-sys-title-large);
      color: inherit;
      text-decoration: none;
    }
    .muted {
      color: var(--mat-sys-on-surface-variant);
      font: var(--mat-sys-body-small);
    }
    .stats {
      display: flex;
      gap: 32px;
      margin: 16px 0 8px;
    }
    .stat {
      display: flex;
      flex-direction: column;
    }
    .label {
      font: var(--mat-sys-label-medium);
      color: var(--mat-sys-on-surface-variant);
    }
    .value {
      font: var(--mat-sys-title-large);
    }
    .win {
      color: light-dark(#2e7d32, #81c784);
    }
    .loss {
      color: var(--mat-sys-error);
    }
    .section {
      font: var(--mat-sys-title-small);
      margin: 16px 0 8px;
    }
    .matches {
      list-style: none;
      margin: 0;
      padding: 0;
    }
    .matches li {
      display: grid;
      grid-template-columns: 56px 110px 1fr auto auto;
      align-items: center;
      gap: 10px;
      padding: 4px 0;
    }
    .hero {
      width: 56px;
      border-radius: 4px;
    }
    .result {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      font: var(--mat-sys-label-large);
      color: var(--mat-sys-error);
    }
    .result.won {
      color: light-dark(#2e7d32, #81c784);
    }
    .kda {
      font: var(--mat-sys-body-medium);
    }
    .date {
      text-decoration: none;
    }
    .heroes {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
    }
    .top-hero {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 4px;
      font: var(--mat-sys-label-medium);
    }
    .top-hero img {
      width: 72px;
      border-radius: 4px;
    }
  `,
})
export class DotaCardComponent {
  readonly summary = input.required<DotaSummary>();

  protected readonly winrate = computed(() => {
    const { wins, losses } = this.summary().last30Days;
    return wins + losses > 0 ? wins / (wins + losses) : null;
  });
}

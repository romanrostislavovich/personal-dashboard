import { DatePipe, DecimalPipe, PercentPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { TranslocoPipe } from '@jsverse/transloco';
import { DotaRecord, DotaSummary } from '@pd/contracts';
import { DotaRankComponent } from './dota-rank.component';

const RECORD_ICONS: Record<DotaRecord['kind'], string> = {
  kills: 'swords',
  assists: 'handshake',
  goldPerMin: 'paid',
  heroDamage: 'local_fire_department',
  lastHits: 'agriculture',
  durationSec: 'hourglass_bottom',
};

/**
 * Dota 2: profile and medal, career totals over the whole saved history,
 * game modes, personal records, recent matches and favourite heroes.
 */
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
        <span class="muted">
          Dota 2
          @if (s.totals.firstMatchAt) {
            ·
            {{
              'games.dota.totals.since'
                | transloco: { date: (s.totals.firstMatchAt | date: 'MMM y') }
            }}
          }
        </span>
      </div>
      <pd-dota-rank [rankTier]="s.rankTier" [leaderboardRank]="s.leaderboardRank" />
    </div>

    @if (s.historyHidden && !s.totals.matches) {
      <div class="notice" role="status">
        <mat-icon>visibility_off</mat-icon>
        <div>
          <strong>{{ 'games.dota.hidden.title' | transloco }}</strong>
          <p>{{ 'games.dota.hidden.text' | transloco }}</p>
        </div>
      </div>
    }

    <div class="tiles">
      <div class="tile">
        <span class="label">{{ 'games.dota.totals.matches' | transloco }}</span>
        <span class="value">{{ s.totals.matches | number }}</span>
      </div>
      <div class="tile">
        <span class="label">{{ 'games.dota.totals.winrate' | transloco }}</span>
        <span class="value">{{ winrate() === null ? '—' : (winrate() | percent: '1.0-1') }}</span>
      </div>
      <div class="tile">
        <span class="label">{{ 'games.dota.totals.hours' | transloco }}</span>
        <span class="value">{{ s.totals.hoursPlayed | number }}</span>
      </div>
      <div class="tile">
        <span class="label">{{ 'games.dota.totals.heroes' | transloco }}</span>
        <span class="value">{{ s.totals.heroesPlayed }}</span>
      </div>
      <div class="tile">
        <span class="label">{{ 'games.dota.last30' | transloco }}</span>
        <span class="value">
          <span class="win">{{ s.last30Days.wins }}</span>
          <span class="dash">–</span>
          <span class="loss">{{ s.last30Days.losses }}</span>
        </span>
      </div>
    </div>

    @if (s.modes.length) {
      <h4 class="section">{{ 'games.dota.modesTitle' | transloco }}</h4>
      <div class="modes">
        @for (m of s.modes; track m.mode) {
          <div class="mode" [class]="'mode mode-' + m.mode">
            <div class="mode-top">
              <span class="chip">{{ 'games.dota.modes.' + m.mode | transloco }}</span>
              <span class="muted">{{ m.matches | number }}</span>
            </div>
            <span class="bar" aria-hidden="true">
              <span [style.width.%]="(m.wins / m.matches) * 100"></span>
            </span>
            <span class="muted">{{ m.wins / m.matches | percent: '1.0-1' }}</span>
          </div>
        }
      </div>
    }

    @if (s.records.length) {
      <h4 class="section">{{ 'games.dota.recordsTitle' | transloco }}</h4>
      <div class="records">
        @for (r of s.records; track r.kind) {
          <a
            class="record"
            [href]="'https://www.opendota.com/matches/' + r.matchId"
            target="_blank"
            rel="noopener"
            [title]="r.hero.name + ' · ' + (r.startedAt | date: 'd MMM y')"
          >
            <mat-icon>{{ recordIcon[r.kind] }}</mat-icon>
            <span class="record-text">
              <span class="label">{{ 'games.dota.records.' + r.kind | transloco }}</span>
              <span class="record-value">
                @if (r.kind === 'durationSec') {
                  {{ r.value / 60 | number: '1.0-0' }} {{ 'games.minutes' | transloco }}
                } @else {
                  {{ r.value | number }}
                }
              </span>
            </span>
            <img class="record-hero" [src]="r.hero.imageUrl" [alt]="r.hero.name" />
          </a>
        }
      </div>
    }

    <h4 class="section">{{ 'games.dota.recentMatches' | transloco }}</h4>
    <ul class="matches">
      @for (m of s.recentMatches; track m.matchId) {
        <li [class.won]="m.won">
          <img class="hero" [src]="m.hero.imageUrl" [alt]="m.hero.name" [title]="m.hero.name" />
          <span class="result">
            {{ (m.won ? 'games.dota.win' : 'games.dota.loss') | transloco }}
          </span>
          <span class="chip small" [class]="'chip small mode-' + m.mode">
            {{ 'games.dota.modes.' + m.mode | transloco }}
          </span>
          <span class="kda">{{ m.kills }} / {{ m.deaths }} / {{ m.assists }}</span>
          <span class="muted">
            {{ m.durationSec / 60 | number: '1.0-0' }} {{ 'games.minutes' | transloco }}
          </span>
          <a
            class="muted date"
            [href]="'https://www.opendota.com/matches/' + m.matchId"
            target="_blank"
            rel="noopener"
            >{{ m.startedAt | date: 'd MMM' }}</a
          >
        </li>
      } @empty {
        <li class="none muted">{{ 'games.dota.noMatches' | transloco }}</li>
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
    :host {
      --win: var(--pd-success);
      --loss: var(--pd-danger);
    }
    .head {
      display: flex;
      align-items: center;
      gap: 14px;
    }
    .avatar {
      width: 56px;
      height: 56px;
      border-radius: 14px;
    }
    .who {
      display: flex;
      flex-direction: column;
      flex: 1;
      min-width: 0;
    }
    .name {
      font: 800 1.3rem / 1.2 var(--pd-font-heading);
      color: inherit;
      text-decoration: none;
    }
    .muted {
      color: var(--mat-sys-on-surface-variant);
      font: 0.8rem / 1.3 var(--pd-font);
    }
    .label {
      font: 600 0.7rem / 1.2 var(--pd-font);
      letter-spacing: 0.04em;
      text-transform: uppercase;
      color: var(--mat-sys-on-surface-variant);
    }
    .notice {
      display: flex;
      gap: 12px;
      margin-top: 16px;
      padding: 14px 16px;
      border-radius: 14px;
      border: 1px solid color-mix(in srgb, var(--pd-rarity-legendary) 50%, transparent);
      background: color-mix(in srgb, var(--pd-rarity-legendary) 10%, transparent);
    }
    .notice mat-icon {
      color: var(--pd-rarity-legendary);
      flex: none;
    }
    .notice p {
      margin: 4px 0 0;
      font: 0.85rem / 1.45 var(--pd-font);
      color: var(--mat-sys-on-surface-variant);
    }
    .tiles {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(110px, 1fr));
      gap: 10px;
      margin-top: 18px;
    }
    .tile {
      display: flex;
      flex-direction: column;
      gap: 6px;
      padding: 12px 14px;
      border-radius: 14px;
      background: color-mix(in srgb, var(--mat-sys-on-surface) 4%, transparent);
    }
    .value {
      font: 800 1.35rem / 1.1 var(--pd-font-heading);
    }
    .win {
      color: var(--win);
    }
    .loss {
      color: var(--loss);
    }
    .dash {
      margin: 0 4px;
      color: var(--mat-sys-on-surface-variant);
    }
    .section {
      font: 700 0.95rem / 1.3 var(--pd-font-heading);
      margin: 22px 0 10px;
    }
    .modes {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
      gap: 10px;
    }
    .mode {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .mode-top {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .chip {
      --mode: var(--mat-sys-primary);
      display: inline-block;
      padding: 3px 10px;
      border-radius: 999px;
      font: 600 0.75rem / 1.3 var(--pd-font);
      color: var(--mode);
      background: color-mix(in srgb, var(--mode) 16%, transparent);
    }
    .chip.small {
      padding: 2px 8px;
      font-size: 0.7rem;
      justify-self: start;
    }
    .mode-turbo {
      --mode: var(--mat-sys-tertiary);
    }
    .mode-ranked {
      --mode: var(--pd-rarity-legendary);
    }
    .mode-unranked {
      --mode: var(--mat-sys-primary);
    }
    .mode-other {
      --mode: var(--mat-sys-on-surface-variant);
    }
    .bar {
      height: 6px;
      border-radius: 3px;
      background: color-mix(in srgb, var(--loss) 30%, transparent);
      overflow: hidden;
    }
    .bar span {
      display: block;
      height: 100%;
      background: var(--win);
    }
    .records {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
      gap: 10px;
    }
    .record {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 10px 12px;
      border-radius: 14px;
      border: 1px solid var(--pd-border);
      color: inherit;
      text-decoration: none;
      transition: border-color 140ms ease;
    }
    .record:hover {
      border-color: color-mix(in srgb, var(--mat-sys-primary) 45%, var(--pd-border));
    }
    .record mat-icon {
      color: var(--mat-sys-primary);
    }
    .record-text {
      display: flex;
      flex-direction: column;
      gap: 2px;
      flex: 1;
      min-width: 0;
    }
    .record-value {
      font: 800 1.1rem / 1.1 var(--pd-font-heading);
    }
    .record-hero {
      width: 48px;
      border-radius: 6px;
    }
    .matches {
      list-style: none;
      margin: 0;
      padding: 0;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .matches li {
      display: grid;
      grid-template-columns: 52px 72px 72px 1fr auto auto;
      align-items: center;
      gap: 10px;
      padding: 6px 10px 6px 6px;
      border-radius: 12px;
      border-left: 3px solid var(--loss);
      background: color-mix(in srgb, var(--loss) 6%, transparent);
    }
    .matches li.won {
      border-left-color: var(--win);
      background: color-mix(in srgb, var(--win) 7%, transparent);
    }
    .matches li.none {
      display: block;
      border: 0;
      background: none;
      padding: 4px 0;
    }
    .hero {
      width: 52px;
      border-radius: 6px;
    }
    .result {
      font: 700 0.8rem / 1 var(--pd-font);
      color: var(--loss);
    }
    .won .result {
      color: var(--win);
    }
    .kda {
      font: 600 0.85rem / 1 var(--pd-font);
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
      gap: 6px;
      font: 600 0.75rem / 1 var(--pd-font);
    }
    .top-hero img {
      width: 76px;
      border-radius: 8px;
    }
    @media (max-width: 600px) {
      .matches li {
        grid-template-columns: 44px 1fr auto;
      }
      .matches li .chip,
      .matches li .kda {
        display: none;
      }
    }
  `,
})
export class DotaCardComponent {
  readonly summary = input.required<DotaSummary>();

  protected readonly recordIcon = RECORD_ICONS;

  protected readonly winrate = computed(() => {
    const { matches, wins } = this.summary().totals;
    return matches > 0 ? wins / matches : null;
  });
}

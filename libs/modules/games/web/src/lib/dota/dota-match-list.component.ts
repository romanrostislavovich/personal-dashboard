import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { DotaListedMatch } from '@pd/contracts';
import { TimeAgoPipe } from '../time-ago.pipe';

/**
 * Matches as rows, like the match list on Dotabuff: hero, result and when, mode and duration,
 * KDA and farm. With several accounts the row names the account it was played on.
 */
@Component({
  selector: 'pd-dota-match-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DecimalPipe, TranslocoPipe, TimeAgoPipe],
  template: `
    <ul class="matches">
      @for (m of matches(); track m.accountId + m.matchId) {
        <li [class.won]="m.won === true" [class.unknown]="m.won === null">
          <img class="hero" [src]="m.hero.imageUrl" alt="" />
          <span class="main">
            <span class="hero-name">{{ m.hero.name }}</span>
            @if (accountNames()[m.accountId]; as account) {
              <span class="muted">{{ account }}</span>
            }
          </span>
          <span class="main">
            <a
              class="result"
              [href]="'https://www.dotabuff.com/matches/' + m.matchId"
              target="_blank"
              rel="noopener"
              >{{
                (m.won === null
                  ? 'games.dota.unknownResult'
                  : m.won
                    ? 'games.dota.wonMatch'
                    : 'games.dota.lostMatch'
                ) | transloco
              }}</a
            >
            <span class="muted">{{ m.startedAt | timeAgo: lang() }}</span>
          </span>
          <span class="main wide">
            <span [class]="'chip mode-' + m.mode">{{
              'games.dota.modes.' + m.mode | transloco
            }}</span>
            <span class="muted">{{ duration(m.durationSec) }}</span>
          </span>
          <span class="main">
            @if (m.kills !== null && m.deaths !== null && m.assists !== null) {
              <span class="kda">{{ m.kills }} / {{ m.deaths }} / {{ m.assists }}</span>
              <span class="muted"
                >KDA {{ (m.kills + m.assists) / (m.deaths || 1) | number: '1.1-1' }}</span
              >
            } @else {
              <span class="muted">—</span>
            }
          </span>
          <span class="main wide right">
            @if (m.goldPerMin !== null) {
              <span class="kda">{{ m.goldPerMin }} / {{ m.xpPerMin }}</span>
              <span class="muted">GPM / XPM</span>
            }
          </span>
        </li>
      } @empty {
        <li class="none muted">{{ 'games.dota.noMatches' | transloco }}</li>
      }
    </ul>
  `,
  styles: `
    :host {
      --win: var(--pd-success);
      --loss: var(--pd-danger);
    }
    .matches {
      list-style: none;
      margin: 0;
      padding: 0;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    li {
      display: grid;
      grid-template-columns: 56px minmax(120px, 1.4fr) 1fr 1fr 1fr 1fr;
      align-items: center;
      gap: 12px;
      padding: 6px 12px 6px 6px;
      border-radius: 10px;
      border-left: 3px solid var(--loss);
      background: color-mix(in srgb, var(--loss) 5%, transparent);
    }
    li.won {
      border-left-color: var(--win);
      background: color-mix(in srgb, var(--win) 6%, transparent);
    }
    li.none {
      display: block;
      border: 0;
      background: none;
      padding: 4px 0;
    }
    .hero {
      width: 56px;
      border-radius: 5px;
    }
    .main {
      display: flex;
      flex-direction: column;
      gap: 2px;
      min-width: 0;
    }
    .right {
      align-items: flex-end;
    }
    .hero-name {
      font-weight: 600;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .result {
      font-weight: 700;
      color: var(--loss);
      text-decoration: none;
    }
    li.unknown {
      border-left-color: var(--mat-sys-outline-variant);
    }
    .unknown .result {
      color: var(--mat-sys-on-surface-variant);
    }
    .won .result {
      color: var(--win);
    }
    .kda {
      font-weight: 600;
      font-variant-numeric: tabular-nums;
    }
    .muted {
      font: var(--mat-sys-body-small);
      color: var(--mat-sys-on-surface-variant);
      white-space: nowrap;
    }
    .chip {
      --mode: var(--mat-sys-primary);
      align-self: flex-start;
      padding: 1px 8px;
      border-radius: 999px;
      font: 600 0.7rem / 1.4 var(--pd-font);
      color: var(--mode);
      background: color-mix(in srgb, var(--mode) 16%, transparent);
    }
    .mode-turbo {
      --mode: var(--mat-sys-tertiary);
    }
    .mode-ranked {
      --mode: var(--pd-rarity-legendary);
    }
    .mode-other {
      --mode: var(--mat-sys-on-surface-variant);
    }
    @media (max-width: 700px) {
      li {
        grid-template-columns: 48px 1fr 1fr 1fr;
      }
      .wide {
        display: none;
      }
      .hero {
        width: 48px;
      }
    }
  `,
})
export class DotaMatchListComponent {
  readonly matches = input.required<DotaListedMatch[]>();
  /** Account id → name, only when several accounts are shown together. */
  readonly accountNames = input<Record<string, string>>({});
  readonly lang = input.required<string>();

  protected duration(seconds: number | null): string {
    if (seconds === null) {
      return '';
    }
    const minutes = Math.floor(seconds / 60);
    return `${minutes}:${String(seconds % 60).padStart(2, '0')}`;
  }
}

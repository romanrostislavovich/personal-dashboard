import { DecimalPipe, PercentPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { MatSortModule, Sort } from '@angular/material/sort';
import { TranslocoPipe } from '@jsverse/transloco';
import { DotaHeroStats } from '@pd/contracts';
import { TimeAgoPipe } from '../time-ago.pipe';

type Column = 'matches' | 'winrate' | 'kda' | 'goldPerMin' | 'xpPerMin' | 'lastPlayedAt';

const VALUE: Record<Column, (h: DotaHeroStats) => number> = {
  matches: (h) => h.matches,
  winrate: (h) => winrate(h) ?? -1,
  kda: (h) => kda(h) ?? -1,
  goldPerMin: (h) => h.goldPerMin ?? -1,
  xpPerMin: (h) => h.xpPerMin ?? -1,
  lastPlayedAt: (h) => new Date(h.lastPlayedAt).getTime(),
};

/** `null` — no match with known numbers yet. */
export function kda({
  kills,
  deaths,
  assists,
}: Pick<DotaHeroStats, 'kills' | 'deaths' | 'assists'>): number | null {
  return kills === null || deaths === null || assists === null
    ? null
    : (kills + assists) / Math.max(1, deaths);
}

/** Wins among the matches with a known result; `null` — there are none yet. */
export function winrate({ wins, decided }: Pick<DotaHeroStats, 'wins' | 'decided'>): number | null {
  return decided ? wins / decided : null;
}

/**
 * Heroes played, like the heroes page on Dotabuff: matches, win rate, KDA and farm per hero.
 * `limit` shows the most played ones only (the overview), without sorting controls.
 */
@Component({
  selector: 'pd-dota-heroes-table',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DecimalPipe, PercentPipe, MatSortModule, TranslocoPipe, TimeAgoPipe],
  template: `
    <div class="scroll">
      <table matSort [matSortDisabled]="!!limit()" (matSortChange)="sort.set($event)">
        <thead>
          <tr>
            <th class="hero-col">{{ 'games.dota.table.hero' | transloco }}</th>
            <th mat-sort-header="matches" arrowPosition="before">
              {{ 'games.dota.table.matches' | transloco }}
            </th>
            <th mat-sort-header="winrate" arrowPosition="before">
              {{ 'games.dota.table.winrate' | transloco }}
            </th>
            <th mat-sort-header="kda" arrowPosition="before">KDA</th>
            @if (!limit()) {
              <th class="wide" mat-sort-header="goldPerMin" arrowPosition="before">GPM</th>
              <th class="wide" mat-sort-header="xpPerMin" arrowPosition="before">XPM</th>
              <th class="wide" mat-sort-header="lastPlayedAt" arrowPosition="before">
                {{ 'games.dota.table.lastPlayed' | transloco }}
              </th>
            }
          </tr>
        </thead>
        <tbody>
          @for (h of rows(); track h.hero.id) {
            <tr>
              <td class="hero-col">
                <img [src]="h.hero.imageUrl" alt="" />
                <span>{{ h.hero.name }}</span>
              </td>
              <td>
                <span class="num">{{ h.matches }}</span>
                <span class="bar share"
                  ><span [style.width.%]="(h.matches / most()) * 100"></span
                ></span>
              </td>
              <td>
                @let rate = winrate(h);
                <span class="num" [class.good]="(rate ?? 0) >= 0.5">{{
                  rate === null ? '—' : (rate | percent: '1.1-1')
                }}</span>
                <span class="bar rate"><span [style.width.%]="(rate ?? 0) * 100"></span></span>
              </td>
              <td>
                @let ratio = kda(h);
                <span class="num">{{ ratio === null ? '—' : (ratio | number: '1.2-2') }}</span>
                @if (ratio !== null) {
                  <span class="kda-parts">{{ h.kills }} / {{ h.deaths }} / {{ h.assists }}</span>
                }
              </td>
              @if (!limit()) {
                <td class="wide num">{{ h.goldPerMin ?? '—' }}</td>
                <td class="wide num">{{ h.xpPerMin ?? '—' }}</td>
                <td class="wide muted">{{ h.lastPlayedAt | timeAgo: lang() }}</td>
              }
            </tr>
          }
        </tbody>
      </table>
    </div>
  `,
  styles: `
    :host {
      --win: var(--pd-success);
      --loss: var(--pd-danger);
    }
    .scroll {
      overflow-x: auto;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      font: var(--mat-sys-body-medium);
    }
    th {
      text-align: left;
      padding: 8px;
      font: 600 0.72rem / 1.2 var(--pd-font);
      letter-spacing: 0.04em;
      text-transform: uppercase;
      color: var(--mat-sys-on-surface-variant);
      border-bottom: 1px solid var(--pd-border);
      white-space: nowrap;
    }
    td {
      padding: 6px 8px;
      border-bottom: 1px solid color-mix(in srgb, var(--pd-border) 50%, transparent);
      vertical-align: middle;
    }
    tbody tr:hover {
      background: color-mix(in srgb, var(--mat-sys-on-surface) 4%, transparent);
    }
    .hero-col {
      display: flex;
      align-items: center;
      gap: 10px;
      min-width: 170px;
      font-weight: 600;
    }
    .hero-col img {
      width: 48px;
      border-radius: 5px;
    }
    .num {
      display: block;
      font-weight: 600;
      font-variant-numeric: tabular-nums;
    }
    .good {
      color: var(--win);
    }
    .bar {
      display: block;
      width: 90px;
      height: 4px;
      margin-top: 4px;
      border-radius: 2px;
      overflow: hidden;
      background: color-mix(in srgb, var(--mat-sys-on-surface) 10%, transparent);
    }
    .bar span {
      display: block;
      height: 100%;
      background: var(--mat-sys-primary);
    }
    .bar.rate {
      background: color-mix(in srgb, var(--loss) 35%, transparent);
    }
    .bar.rate span {
      background: var(--win);
    }
    .kda-parts,
    .muted {
      font: var(--mat-sys-body-small);
      color: var(--mat-sys-on-surface-variant);
      white-space: nowrap;
    }
    @media (max-width: 700px) {
      .wide {
        display: none;
      }
    }
  `,
})
export class DotaHeroesTableComponent {
  readonly heroes = input.required<DotaHeroStats[]>();
  /** Show only the N most played (the overview). */
  readonly limit = input<number | null>(null);
  readonly lang = input.required<string>();

  protected readonly kda = kda;
  protected readonly winrate = winrate;
  protected readonly sort = signal<Sort>({ active: 'matches', direction: 'desc' });
  protected readonly most = computed(() => Math.max(1, ...this.heroes().map((h) => h.matches)));

  protected readonly rows = computed(() => {
    const limit = this.limit();
    if (limit) {
      return this.heroes().slice(0, limit);
    }
    const { active, direction } = this.sort();
    const value = VALUE[active as Column];
    if (!value || !direction) {
      return this.heroes();
    }
    const sign = direction === 'asc' ? 1 : -1;
    return [...this.heroes()].sort((a, b) => sign * (value(a) - value(b)));
  });
}

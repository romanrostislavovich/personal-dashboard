import { DatePipe, DecimalPipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { GameAccount, WowSummary } from '@pd/contracts';
import { SparklineComponent } from '@pd/web-core';
import { firstValueFrom } from 'rxjs';
import { GamesApi } from '../games.api';
import { TimeAgoPipe } from '../time-ago.pipe';
import { WowCharacterDetailsComponent } from './wow-character-details.component';

/** Official class colours by Blizzard class id. */
const CLASS_COLORS: Record<number, string> = {
  1: '#c69b6d',
  2: '#f48cba',
  3: '#aad372',
  4: '#fff468',
  5: '#f0f0f0',
  6: '#c41e3a',
  7: '#0070dd',
  8: '#3fc7eb',
  9: '#8788ee',
  10: '#00ff98',
  11: '#ff7c0a',
  12: '#a330c9',
  13: '#33937f',
};

const RECENT_FEED = 12;

interface Character {
  account: GameAccount;
  summary: WowSummary | null;
}

/**
 * World of Warcraft in the spirit of Raider.IO: characters with class colours and item level,
 * totals over all of them, a table that compares them, the details of the chosen one (gear,
 * Mythic+, raids…), the price of the WoW Token and one feed of recent achievements.
 * Achievement points are account-wide in WoW, so the total is the highest, not a sum.
 */
@Component({
  selector: 'pd-wow-dashboard',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    DecimalPipe,
    MatButtonModule,
    MatIconModule,
    MatTooltipModule,
    TranslocoPipe,
    TimeAgoPipe,
    SparklineComponent,
    WowCharacterDetailsComponent,
  ],
  template: `
    @if (characters().length) {
      <div class="tiles">
        <div class="tile">
          <span class="label">{{ 'games.wow.characters' | transloco }}</span>
          <span class="value">{{ characters().length }}</span>
        </div>
        <div class="tile">
          <span class="label">{{ 'games.wow.bestItemLevel' | transloco }}</span>
          <span class="value">{{ totals().itemLevel ?? '—' }}</span>
        </div>
        <div class="tile">
          <span class="label">{{ 'games.wow.achievementPoints' | transloco }}</span>
          <span class="value">{{ totals().points | number }}</span>
        </div>
        <div class="tile">
          <span class="label">{{ 'games.wow.achievements' | transloco }}</span>
          <span class="value">{{ totals().achievements | number }}</span>
        </div>
        @if (totals().mythic) {
          <div class="tile">
            <span class="label">{{ 'games.wow.bestMythic' | transloco }}</span>
            <span class="value">{{ totals().mythic | number }}</span>
          </div>
        }
        @if (totals().mounts) {
          <div class="tile">
            <span class="label">{{ 'games.wow.collections.mounts' | transloco }}</span>
            <span class="value">{{ totals().mounts | number }}</span>
          </div>
        }
        @for (token of tokens.value(); track token.region) {
          <div class="tile token">
            <span class="label">
              {{ 'games.wow.token' | transloco }} · {{ token.region.toUpperCase() }}
            </span>
            <span class="value">{{ token.price | number }} <small>g</small></span>
            @if (token.history.length > 1) {
              <pd-sparkline
                [points]="tokenPoints(token.history)"
                [label]="'games.wow.token' | transloco"
              />
            }
          </div>
        }
      </div>
    }

    <div class="characters">
      @for (c of characters(); track c.account.id) {
        <article
          class="character"
          [class.selected]="selected()?.account?.id === c.account.id"
          [style.--class]="classColor(c.summary)"
        >
          @if (c.summary; as s) {
            <div class="head">
              @if (s.avatarUrl) {
                <img class="avatar" [src]="s.avatarUrl" alt="" />
              }
              <div class="who">
                @if (s.profileUrl; as url) {
                  <a class="name" [href]="url" target="_blank" rel="noopener">{{ s.name }}</a>
                } @else {
                  <!-- Classic: Blizzard's site has no page for the character. -->
                  <span class="name">{{ s.name }}</span>
                }
                <span class="muted"
                  >{{ s.level }} {{ s.raceName }} {{ s.specName ?? '' }} {{ s.className }}</span
                >
                <span class="muted">
                  {{ s.realm }}
                  @if (s.version !== 'retail') {
                    · {{ 'games.wow.versions.' + s.version | transloco }}
                  }
                  @if (s.guild) {
                    · &lt;{{ s.guild }}&gt;
                  }
                </span>
              </div>
              <div class="ilvl">
                <span class="value">{{ s.itemLevel ?? '—' }}</span>
                <span class="label">ilvl</span>
              </div>
            </div>
            <div class="facts">
              <span
                ><mat-icon inline>emoji_events</mat-icon> {{ s.achievementPoints | number }}</span
              >
              @if (s.lastLoginAt) {
                <span class="muted"
                  >{{ 'games.wow.lastLogin' | transloco }}
                  {{ s.lastLoginAt | timeAgo: lang() }}</span
                >
              }
            </div>
          } @else {
            <p class="who">{{ c.account.displayName }}</p>
          }
          @if (c.account.lastError) {
            <p class="error">{{ c.account.lastError }}</p>
          }
          <div class="actions">
            @if (c.summary; as s) {
              <button matButton (click)="select(c.account.id)">
                <mat-icon>{{
                  selected()?.account?.id === c.account.id ? 'expand_less' : 'expand_more'
                }}</mat-icon>
                {{ 'games.wow.details.open' | transloco }}
              </button>
              <button
                matIconButton
                [matTooltip]="(s.notify ? 'games.wow.notifyOn' : 'games.wow.notifyOff') | transloco"
                [attr.aria-label]="'games.wow.notifyOn' | transloco"
                [attr.aria-pressed]="s.notify"
                [disabled]="busy()"
                (click)="toggleNotify(c.account.id, s)"
              >
                <mat-icon>{{ s.notify ? 'notifications_active' : 'notifications_off' }}</mat-icon>
              </button>
            }
            <button
              matIconButton
              [matTooltip]="'games.syncNow' | transloco"
              [disabled]="busy()"
              (click)="sync.emit(c.account.id)"
            >
              <mat-icon>sync</mat-icon>
            </button>
            <button
              matIconButton
              [matTooltip]="'core.actions.delete' | transloco"
              [disabled]="busy()"
              (click)="remove.emit(c.account.id)"
            >
              <mat-icon>delete</mat-icon>
            </button>
          </div>
        </article>
      } @empty {
        <p class="muted">{{ 'games.wow.empty' | transloco }}</p>
      }
    </div>

    @if (selected()?.summary; as chosen) {
      <pd-wow-character-details [character]="chosen" />
    }

    <!-- Several characters side by side. -->
    @if (compared().length > 1) {
      <section class="panel">
        <h3>{{ 'games.wow.compare' | transloco }}</h3>
        <div class="scroll">
          <table>
            <thead>
              <tr>
                <th>{{ 'games.wow.character' | transloco }}</th>
                <th class="numeric">{{ 'games.wow.level' | transloco }}</th>
                <th class="numeric">ilvl</th>
                <th class="numeric">Mythic+</th>
                <th class="numeric">{{ 'games.wow.details.raids' | transloco }}</th>
                <th class="numeric">PvP</th>
                <th class="numeric">{{ 'games.wow.collections.quests' | transloco }}</th>
              </tr>
            </thead>
            <tbody>
              @for (row of compared(); track row.id) {
                <tr>
                  <td>
                    <b [style.color]="row.color">{{ row.name }}</b>
                    <span class="muted">{{ row.spec }}</span>
                  </td>
                  <td class="numeric">{{ row.level }}</td>
                  <td class="numeric">{{ row.itemLevel ?? '—' }}</td>
                  <td class="numeric">{{ row.mythic ?? '—' }}</td>
                  <td class="numeric">{{ row.raid ?? '—' }}</td>
                  <td class="numeric">{{ row.pvp ?? '—' }}</td>
                  <td class="numeric">{{ row.quests ?? '—' }}</td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      </section>
    }

    @if (feed().length) {
      <section class="panel">
        <h3>{{ 'games.wow.recentAchievements' | transloco }}</h3>
        <ul class="feed">
          @for (a of feed(); track a.character + a.id) {
            <li>
              <mat-icon inline>emoji_events</mat-icon>
              <a
                [href]="'https://www.wowhead.com/achievement=' + a.id"
                target="_blank"
                rel="noopener"
                >{{ a.name }}</a
              >
              @if (characters().length > 1) {
                <span class="muted">{{ a.character }}</span>
              }
              <span class="muted date">{{ a.completedAt | date: 'd MMM y' }}</span>
            </li>
          }
        </ul>
      </section>
    }
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }
    .label {
      font: 600 0.7rem / 1.2 var(--pd-font);
      letter-spacing: 0.04em;
      text-transform: uppercase;
      color: var(--mat-sys-on-surface-variant);
    }
    .muted {
      font: var(--mat-sys-body-small);
      color: var(--mat-sys-on-surface-variant);
    }
    .error {
      margin: 8px 0 0;
      color: var(--mat-sys-error);
      font: var(--mat-sys-body-small);
    }
    .tiles {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
      gap: 10px;
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
    .characters {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(min(360px, 100%), 1fr));
      gap: 12px;
    }
    .character.selected {
      border-color: var(--class);
    }
    .token small {
      font: var(--mat-sys-body-small);
      color: var(--mat-sys-on-surface-variant);
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
      padding: 4px 8px;
      text-align: left;
      font: var(--mat-sys-label-medium);
      color: var(--mat-sys-on-surface-variant);
    }
    td {
      padding: 6px 8px;
      border-top: 1px solid var(--mat-sys-outline-variant);
    }
    td .muted {
      margin-left: 8px;
    }
    .numeric {
      text-align: right;
      font-variant-numeric: tabular-nums;
      white-space: nowrap;
    }
    .character {
      --class: var(--mat-sys-primary);
      position: relative;
      padding: 14px 16px 10px;
      border-radius: var(--pd-radius);
      border: 1px solid color-mix(in srgb, var(--class) 45%, var(--pd-border));
      background:
        linear-gradient(135deg, color-mix(in srgb, var(--class) 16%, transparent), transparent 60%),
        var(--pd-card);
    }
    .head {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .avatar {
      width: 56px;
      height: 56px;
      border-radius: 12px;
      border: 2px solid var(--class);
    }
    .who {
      display: flex;
      flex-direction: column;
      flex: 1;
      min-width: 0;
      margin: 0;
    }
    .name {
      font: 800 1.2rem / 1.2 var(--pd-font-heading);
      color: color-mix(in srgb, var(--class) 75%, var(--mat-sys-on-surface));
      text-decoration: none;
    }
    .ilvl {
      display: flex;
      flex-direction: column;
      align-items: flex-end;
    }
    .facts {
      display: flex;
      flex-wrap: wrap;
      justify-content: space-between;
      gap: 8px;
      margin-top: 12px;
      font-weight: 600;
    }
    .facts mat-icon {
      color: var(--pd-rarity-legendary);
    }
    .actions {
      display: flex;
      align-items: center;
      justify-content: flex-end;
    }
    .actions [matButton] {
      margin-right: auto;
    }
    .panel {
      padding: 14px 16px;
      border-radius: var(--pd-radius);
      border: 1px solid var(--pd-border);
      background: var(--pd-card);
    }
    .panel h3 {
      margin: 0 0 8px;
      font: 700 1rem / 1.3 var(--pd-font-heading);
    }
    .feed {
      list-style: none;
      margin: 0;
      padding: 0;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .feed li {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .feed mat-icon {
      color: var(--pd-rarity-legendary);
    }
    .feed a {
      color: inherit;
      font-weight: 600;
    }
    .date {
      margin-left: auto;
      white-space: nowrap;
    }
  `,
})
export class WowDashboardComponent {
  /** The user's WoW characters. */
  readonly accounts = input.required<GameAccount[]>();
  readonly busy = input(false);
  readonly sync = output<string>();
  readonly remove = output<string>();
  /** The notifications of a character were switched: the page reloads the accounts. */
  readonly changed = output<void>();

  private readonly api = inject(GamesApi);
  protected readonly tokens = this.api.wowTokens();
  /** The character whose details are open. */
  private readonly selectedId = signal<string | null>(null);

  protected readonly lang = toSignal(inject(TranslocoService).langChanges$, {
    initialValue: 'en',
  });

  protected readonly characters = computed<Character[]>(() =>
    this.accounts()
      .map((account) => ({
        account,
        summary: account.summary?.game === 'wow' ? account.summary : null,
      }))
      .sort((a, b) => (b.summary?.itemLevel ?? 0) - (a.summary?.itemLevel ?? 0)),
  );

  protected readonly selected = computed(
    () => this.characters().find((c) => c.account.id === this.selectedId()) ?? null,
  );

  /**
   * Achievements, their points and the collections are shared by the characters of one
   * Battle.net account, so the total is the highest number, not a sum.
   */
  protected readonly totals = computed(() => {
    const summaries = this.characters().flatMap((c) => (c.summary ? [c.summary] : []));
    const best = (value: (s: WowSummary) => number | null | undefined) =>
      summaries.length ? Math.max(...summaries.map((s) => value(s) ?? 0)) : null;
    return {
      itemLevel: best((s) => s.itemLevel),
      points: best((s) => s.achievementPoints) ?? 0,
      achievements: best((s) => s.totalAchievements) ?? 0,
      mythic: best((s) => s.details?.mythic?.rating),
      mounts: best((s) => s.details?.collections.mounts),
    };
  });

  /** A line per character for the comparison table. */
  protected readonly compared = computed(() =>
    this.characters().flatMap(({ account, summary }) => {
      if (!summary) {
        return [];
      }
      const raid = summary.details?.raids[0];
      const kills = raid ? Math.max(0, ...raid.modes.map((mode) => mode.killed)) : null;
      const total = raid ? Math.max(0, ...raid.modes.map((mode) => mode.total)) : null;
      const pvp = summary.details?.pvp?.brackets[0];
      return [
        {
          id: account.id,
          name: summary.name,
          spec: `${summary.specName ?? ''} ${summary.className}`.trim(),
          color: this.classColor(summary),
          level: summary.level,
          itemLevel: summary.itemLevel,
          mythic: summary.details?.mythic?.rating ?? null,
          raid: raid ? `${kills}/${total}` : null,
          pvp: pvp ? `${pvp.rating} (${pvp.bracket})` : null,
          quests: summary.details?.collections.quests ?? null,
        },
      ];
    }),
  );

  /** Recent achievements of every character, newest first, each achievement once. */
  protected readonly feed = computed(() => {
    const seen = new Set<number>();
    return this.characters()
      .flatMap((c) =>
        (c.summary?.recentAchievements ?? []).map((a) => ({
          ...a,
          character: c.summary?.name ?? c.account.displayName,
        })),
      )
      .sort((a, b) => b.completedAt.localeCompare(a.completedAt))
      .filter((a) => !seen.has(a.id) && seen.add(a.id))
      .slice(0, RECENT_FEED);
  });

  protected select(accountId: string): void {
    this.selectedId.update((current) => (current === accountId ? null : accountId));
  }

  protected tokenPoints(history: { day: string; price: number }[]) {
    return history.map(({ day, price }) => ({ at: day, value: price }));
  }

  protected async toggleNotify(accountId: string, summary: WowSummary): Promise<void> {
    await firstValueFrom(this.api.updateWowCharacter(accountId, { notify: !summary.notify }));
    this.changed.emit();
  }

  protected classColor(summary: WowSummary | null): string | null {
    return summary?.classId ? (CLASS_COLORS[summary.classId] ?? null) : null;
  }
}

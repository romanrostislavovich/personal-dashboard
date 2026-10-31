import {DatePipe, DecimalPipe} from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import {toSignal} from '@angular/core/rxjs-interop';
import {MatButtonModule} from '@angular/material/button';
import {MatIconModule} from '@angular/material/icon';
import {MatTooltipModule} from '@angular/material/tooltip';
import {TranslocoPipe, TranslocoService} from '@jsverse/transloco';
import {GameAccount, WowSummary} from '@pd/contracts';
import {SparklineComponent} from '@pd/web-core';
import {firstValueFrom} from 'rxjs';
import {GamesApi} from '../games.api';
import {TimeAgoPipe} from '../time-ago.pipe';
import {WowCharacterDetailsComponent} from './wow-character-details.component';

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
  templateUrl: './wow-dashboard.component.html',
  styleUrl: './wow-dashboard.component.scss',
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
      .map(account => ({
        account,
        summary: account.summary?.game === 'wow' ? account.summary : null,
      }))
      .sort(
        (a, b) => (b.summary?.itemLevel ?? 0) - (a.summary?.itemLevel ?? 0),
      ),
  );

  protected readonly selected = computed(
    () =>
      this.characters().find(c => c.account.id === this.selectedId()) ?? null,
  );

  /**
   * Achievements, their points and the collections are shared by the characters of one
   * Battle.net account, so the total is the highest number, not a sum.
   */
  protected readonly totals = computed(() => {
    const summaries = this.characters().flatMap(c =>
      c.summary ? [c.summary] : [],
    );
    const best = (value: (s: WowSummary) => number | null | undefined) =>
      summaries.length ? Math.max(...summaries.map(s => value(s) ?? 0)) : null;
    return {
      itemLevel: best(s => s.itemLevel),
      points: best(s => s.achievementPoints) ?? 0,
      achievements: best(s => s.totalAchievements) ?? 0,
      mythic: best(s => s.details?.mythic?.rating),
      mounts: best(s => s.details?.collections.mounts),
    };
  });

  /** A line per character for the comparison table. */
  protected readonly compared = computed(() =>
    this.characters().flatMap(({account, summary}) => {
      if (!summary) {
        return [];
      }
      const raid = summary.details?.raids[0];
      const kills = raid
        ? Math.max(0, ...raid.modes.map(mode => mode.killed))
        : null;
      const total = raid
        ? Math.max(0, ...raid.modes.map(mode => mode.total))
        : null;
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
      .flatMap(c =>
        (c.summary?.recentAchievements ?? []).map(a => ({
          ...a,
          character: c.summary?.name ?? c.account.displayName,
        })),
      )
      .sort((a, b) => b.completedAt.localeCompare(a.completedAt))
      .filter(a => !seen.has(a.id) && seen.add(a.id))
      .slice(0, RECENT_FEED);
  });

  protected select(accountId: string): void {
    this.selectedId.update(current =>
      current === accountId ? null : accountId,
    );
  }

  protected tokenPoints(history: {day: string; price: number}[]) {
    return history.map(({day, price}) => ({at: day, value: price}));
  }

  protected async toggleNotify(
    accountId: string,
    summary: WowSummary,
  ): Promise<void> {
    await firstValueFrom(
      this.api.updateWowCharacter(accountId, {notify: !summary.notify}),
    );
    this.changed.emit();
  }

  protected classColor(summary: WowSummary | null): string | null {
    return summary?.classId ? (CLASS_COLORS[summary.classId] ?? null) : null;
  }
}

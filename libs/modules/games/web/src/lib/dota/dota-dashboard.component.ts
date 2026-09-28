import { DatePipe, DecimalPipe, PercentPipe } from '@angular/common';
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
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { DotaAccountSummary, GameAccount } from '@pd/contracts';
import { GamesApi } from '../games.api';
import { TimeAgoPipe } from '../time-ago.pipe';
import { DotaActivityComponent } from './dota-activity.component';
import { DotaHeroesTableComponent, kda } from './dota-heroes-table.component';
import { DotaMatchListComponent } from './dota-match-list.component';
import { DotaMatchesComponent } from './dota-matches.component';
import { DotaModesRecordsComponent } from './dota-modes-records.component';
import { DotaRankComponent } from './dota-rank.component';

type View = 'overview' | 'heroes' | 'matches';

/**
 * Dota 2 in the spirit of Dotabuff: a player header, then Overview / Heroes / Matches.
 * "All accounts" adds up every Dota account; a chip narrows everything to one account.
 */
@Component({
  selector: 'pd-dota-dashboard',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    DecimalPipe,
    PercentPipe,
    MatButtonModule,
    MatButtonToggleModule,
    MatIconModule,
    MatProgressBarModule,
    MatTooltipModule,
    TranslocoPipe,
    TimeAgoPipe,
    DotaActivityComponent,
    DotaHeroesTableComponent,
    DotaMatchListComponent,
    DotaMatchesComponent,
    DotaModesRecordsComponent,
    DotaRankComponent,
  ],
  templateUrl: './dota-dashboard.component.html',
  styleUrl: './dota-dashboard.component.scss',
})
export class DotaDashboardComponent {
  /** The user's Dota accounts (for the chips and the actions). */
  readonly accounts = input.required<GameAccount[]>();
  readonly busy = input(false);
  readonly sync = output<string>();
  readonly remove = output<string>();

  protected readonly lang = toSignal(inject(TranslocoService).langChanges$, {
    initialValue: 'en',
  });

  private readonly chosen = signal<string | null>(null);
  protected readonly view = signal<View>('overview');

  /** The chosen account, or `null` (all) when it is gone or there is only one anyway. */
  protected readonly accountId = computed(() => {
    const id = this.chosen();
    return this.accounts().some((account) => account.id === id) ? id : null;
  });

  /** Reading `accounts()` here reloads the overview after an account was added or refreshed. */
  protected readonly overview = inject(GamesApi).dotaOverview(() => {
    this.accounts();
    return this.accountId();
  });

  protected readonly single = computed<DotaAccountSummary | null>(() => {
    const accounts = this.overview.value()?.accounts ?? [];
    return accounts.length === 1 ? accounts[0] : null;
  });

  /** The best medal over the shown accounts. */
  protected readonly bestRank = computed(() => {
    const ranks = (this.overview.value()?.accounts ?? []).map((a) => a.rankTier ?? 0);
    return Math.max(0, ...ranks) || null;
  });

  /** Names on match rows only when several accounts are mixed. */
  protected readonly accountNames = computed<Record<string, string>>(() => {
    const accounts = this.overview.value()?.accounts ?? [];
    return accounts.length > 1
      ? Object.fromEntries(accounts.map((a) => [a.id, a.personaName]))
      : {};
  });

  protected readonly winrate = computed(() => {
    const totals = this.overview.value()?.totals;
    return totals?.matches ? totals.wins / totals.matches : null;
  });

  protected readonly kda = computed(() => {
    const totals = this.overview.value()?.totals;
    return totals?.matches ? kda(totals) : null;
  });

  protected select(accountId: string | null): void {
    this.chosen.set(accountId);
  }

  protected avatarOf(account: GameAccount): string | null {
    return account.summary?.game === 'dota2' ? account.summary.avatarUrl : null;
  }

  /** `rank_tier` is medal × 10 + stars. */
  protected medalOf(rankTier: number | null): number {
    return Math.floor((rankTier ?? 0) / 10);
  }
}

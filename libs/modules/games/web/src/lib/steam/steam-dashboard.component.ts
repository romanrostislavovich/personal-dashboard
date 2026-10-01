import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { GameAccount, SteamGame, steamIconUrl, SteamSummary } from '@pd/contracts';
import { TimeAgoPipe } from '../time-ago.pipe';

interface Profile {
  account: GameAccount;
  summary: SteamSummary | null;
}

/**
 * Steam accounts: the profile, totals of the library and the played games with their hours
 * and achievements. Several accounts are shown one under another.
 */
@Component({
  selector: 'pd-steam-dashboard',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DecimalPipe,
    MatButtonModule,
    MatIconModule,
    MatTooltipModule,
    TranslocoPipe,
    TimeAgoPipe,
  ],
  template: `
    @for (profile of profiles(); track profile.account.id) {
      <section class="profile">
        <header class="head">
          @if (profile.summary?.avatarUrl; as avatar) {
            <img class="avatar" [src]="avatar" alt="" />
          }
          <div class="who">
            @if (profile.summary; as s) {
              <a class="name" [href]="s.profileUrl" target="_blank" rel="noopener">{{
                s.personaName
              }}</a>
              @if (s.level !== null) {
                <span class="muted">{{ 'games.steam.level' | transloco: { level: s.level } }}</span>
              }
            } @else {
              <span class="name">{{ profile.account.displayName }}</span>
            }
            <span class="muted small">
              @if (profile.account.lastSyncedAt) {
                {{ 'games.synced' | transloco }}
                {{ profile.account.lastSyncedAt | timeAgo: lang() }}
              }
            </span>
            @if (profile.account.lastError) {
              <span class="error">{{ profile.account.lastError }}</span>
            }
          </div>
          <span class="spacer"></span>
          <button
            matIconButton
            [matTooltip]="'games.syncNow' | transloco"
            [disabled]="busy()"
            (click)="sync.emit(profile.account.id)"
          >
            <mat-icon>sync</mat-icon>
          </button>
          <button
            matIconButton
            [matTooltip]="'core.actions.delete' | transloco"
            [disabled]="busy()"
            (click)="remove.emit(profile.account.id)"
          >
            <mat-icon>delete</mat-icon>
          </button>
        </header>

        @if (profile.summary; as s) {
          @if (s.gamesHidden) {
            <p class="muted">{{ 'games.steam.gamesHidden' | transloco }}</p>
          } @else {
            <div class="tiles">
              <div class="tile">
                <span class="label">{{ 'games.steam.hours' | transloco }}</span>
                <span class="value">{{ hours(s.totals.minutes) | number }}</span>
              </div>
              <div class="tile">
                <span class="label">{{ 'games.steam.hours2Weeks' | transloco }}</span>
                <span class="value">{{ hours(s.totals.minutes2Weeks) | number: '1.0-1' }}</span>
              </div>
              <div class="tile">
                <span class="label">{{ 'games.steam.played' | transloco }}</span>
                <span class="value">{{ s.totals.played | number }}</span>
                <span class="muted small">
                  {{ 'games.steam.ofLibrary' | transloco: { count: s.totals.games } }}
                </span>
              </div>
              <div class="tile">
                <span class="label">{{ 'games.steam.achievements' | transloco }}</span>
                <span class="value">{{ s.totals.achievements | number }}</span>
              </div>
            </div>

            <div class="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>{{ 'games.steam.game' | transloco }}</th>
                    <th class="numeric">{{ 'games.steam.hours' | transloco }}</th>
                    <th class="numeric">{{ 'games.steam.hours2Weeks' | transloco }}</th>
                    <th class="numeric">{{ 'games.steam.achievements' | transloco }}</th>
                    <th class="numeric">{{ 'games.steam.lastPlayed' | transloco }}</th>
                  </tr>
                </thead>
                <tbody>
                  @for (game of s.games; track game.appId) {
                    <tr>
                      <td class="game">
                        @if (icon(game); as src) {
                          <img [src]="src" alt="" width="24" height="24" loading="lazy" />
                        }
                        <a [href]="storeUrl(game)" target="_blank" rel="noopener">{{
                          game.name
                        }}</a>
                      </td>
                      <td class="numeric">{{ hours(game.minutes) | number: '1.0-1' }}</td>
                      <td class="numeric">
                        {{
                          game.minutes2Weeks ? (hours(game.minutes2Weeks) | number: '1.0-1') : '—'
                        }}
                      </td>
                      <td class="numeric">
                        {{
                          game.achievements
                            ? game.achievements.unlocked + ' / ' + game.achievements.total
                            : '—'
                        }}
                      </td>
                      <td class="numeric muted">{{ game.lastPlayedAt | timeAgo: lang() }}</td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          }
        }
      </section>
    } @empty {
      <p class="muted">{{ 'games.steam.empty' | transloco }}</p>
    }
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: 24px;
    }
    .profile {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
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
      min-width: 0;
    }
    .name {
      font: 700 1.2rem / 1.3 var(--pd-font-heading);
      color: inherit;
      text-decoration: none;
    }
    .spacer {
      flex: 1;
    }
    .muted {
      color: var(--mat-sys-on-surface-variant);
    }
    .small {
      font: var(--mat-sys-body-small);
    }
    .error {
      color: var(--mat-sys-error);
      font: var(--mat-sys-body-small);
    }
    .tiles {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
      gap: 12px;
    }
    .tile {
      display: flex;
      flex-direction: column;
      gap: 4px;
      padding: 14px 16px;
      border: 1px solid var(--pd-border);
      border-radius: var(--pd-radius);
      background: var(--pd-card);
    }
    .label {
      font: var(--mat-sys-label-medium);
      color: var(--mat-sys-on-surface-variant);
    }
    .value {
      font: 800 1.5rem / 1 var(--pd-font-heading);
    }
    .table-wrap {
      overflow-x: auto;
      border: 1px solid var(--pd-border);
      border-radius: var(--pd-radius);
      background: var(--pd-card);
    }
    table {
      width: 100%;
      border-collapse: collapse;
      font: var(--mat-sys-body-medium);
    }
    th {
      padding: 8px 12px;
      text-align: left;
      font: var(--mat-sys-label-medium);
      color: var(--mat-sys-on-surface-variant);
      white-space: nowrap;
    }
    td {
      padding: 6px 12px;
      border-top: 1px solid var(--mat-sys-outline-variant);
    }
    .numeric {
      text-align: right;
      font-variant-numeric: tabular-nums;
      white-space: nowrap;
    }
    .game {
      display: flex;
      align-items: center;
      gap: 10px;
      min-width: 220px;
    }
    .game img {
      border-radius: 4px;
    }
    .game a {
      color: inherit;
      text-decoration: none;
    }
  `,
})
export class SteamDashboardComponent {
  /** The user's Steam accounts. */
  readonly accounts = input.required<GameAccount[]>();
  readonly busy = input(false);
  readonly sync = output<string>();
  readonly remove = output<string>();

  protected readonly lang = toSignal(inject(TranslocoService).langChanges$, {
    initialValue: 'en',
  });

  protected readonly profiles = computed<Profile[]>(() =>
    this.accounts().map((account) => ({
      account,
      summary: account.summary?.game === 'steam' ? account.summary : null,
    })),
  );

  protected hours(minutes: number): number {
    return minutes / 60;
  }

  protected icon(game: SteamGame): string | null {
    return game.iconHash ? steamIconUrl(game.appId, game.iconHash) : null;
  }

  protected storeUrl(game: SteamGame): string {
    return `https://store.steampowered.com/app/${game.appId}`;
  }
}

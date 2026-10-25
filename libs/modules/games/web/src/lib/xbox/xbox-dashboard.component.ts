import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { GameAccount, XboxSummary } from '@pd/contracts';
import { TimeAgoPipe } from '../time-ago.pipe';

interface Profile {
  account: GameAccount;
  summary: XboxSummary | null;
}

/**
 * The Xbox account of the OpenXBL key: gamerscore, the games of its title history with their
 * achievements, the last played first. Xbox tells no hours this way.
 */
@Component({
  selector: 'pd-xbox-dashboard',
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
                s.gamertag
              }}</a>
              @if (s.tier) {
                <span class="muted">{{ s.tier }}</span>
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
          <div class="tiles">
            <div class="tile">
              <span class="label">Gamerscore</span>
              <span class="value">{{ s.gamerscore | number }}</span>
            </div>
            <div class="tile">
              <span class="label">{{ 'games.xbox.games' | transloco }}</span>
              <span class="value">{{ s.totals.games | number }}</span>
            </div>
            <div class="tile">
              <span class="label">{{ 'games.xbox.achievements' | transloco }}</span>
              <span class="value">{{ s.totals.achievements | number }}</span>
            </div>
          </div>

          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{{ 'games.xbox.game' | transloco }}</th>
                  <th class="numeric">Gamerscore</th>
                  <th class="numeric">{{ 'games.xbox.achievements' | transloco }}</th>
                  <th class="numeric">{{ 'games.xbox.lastPlayed' | transloco }}</th>
                </tr>
              </thead>
              <tbody>
                @for (game of s.games; track game.titleId) {
                  <tr>
                    <td class="game">
                      @if (game.imageUrl; as src) {
                        <img [src]="src" alt="" width="24" height="24" loading="lazy" />
                      }
                      <span>{{ game.name }}</span>
                    </td>
                    <td class="numeric">
                      {{
                        game.totalGamerscore ? game.gamerscore + ' / ' + game.totalGamerscore : '—'
                      }}
                    </td>
                    <td class="numeric">
                      {{
                        game.achievements
                          ? game.achievements.unlocked + ' / ' + game.achievements.total
                          : '—'
                      }}
                    </td>
                    <td class="numeric muted">
                      {{ game.lastPlayedAt ? (game.lastPlayedAt | timeAgo: lang()) : '—' }}
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        }
      </section>
    } @empty {
      <p class="muted">{{ 'games.xbox.empty' | transloco }}</p>
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
    .unit {
      font: var(--mat-sys-title-small);
      color: var(--mat-sys-on-surface-variant);
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
export class XboxDashboardComponent {
  /** The user's Xbox account (one per OpenXBL key). */
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
      summary: account.summary?.game === 'xbox' ? account.summary : null,
    })),
  );
}

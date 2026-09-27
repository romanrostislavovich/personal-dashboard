import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { DotaSummary, GameAccount, WowSummary } from '@pd/contracts';
import { DotaRankComponent } from './dota/dota-rank.component';
import { GamesApi } from './games.api';

/** Виджет главной: медаль и винрейт в Dota, ilvl и последняя ачивка в WoW. */
@Component({
  selector: 'pd-games-widget',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, MatCardModule, MatButtonModule, TranslocoPipe, DotaRankComponent],
  template: `
    <mat-card appearance="outlined">
      <mat-card-header>
        <mat-card-title>🎮 {{ 'games.title' | transloco }}</mat-card-title>
      </mat-card-header>
      <mat-card-content>
        @for (account of accounts.value(); track account.id) {
          <div class="row">
            @if (dota(account); as d) {
              <pd-dota-rank [rankTier]="d.rankTier" />
              <div class="info">
                <b>{{ d.personaName }}</b>
                <span class="muted">
                  {{
                    'games.widget.dota30'
                      | transloco: { wins: d.last30Days.wins, losses: d.last30Days.losses }
                  }}
                </span>
              </div>
            } @else if (wow(account); as w) {
              @if (w.avatarUrl) {
                <img class="avatar" [src]="w.avatarUrl" alt="" />
              }
              <div class="info">
                <b>{{ w.name }}</b>
                <span class="muted">ilvl {{ w.itemLevel ?? '—' }} · {{ w.className }}</span>
                @if (w.recentAchievements[0]; as last) {
                  <span class="muted">🏆 {{ last.name }}</span>
                }
              </div>
            }
          </div>
        } @empty {
          <p class="muted">{{ 'games.widget.empty' | transloco }}</p>
        }
      </mat-card-content>
      <mat-card-actions align="end">
        <a matButton routerLink="/games">{{ 'games.widget.open' | transloco }}</a>
      </mat-card-actions>
    </mat-card>
  `,
  styles: `
    .row {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 8px 0;
    }
    .info {
      display: flex;
      flex-direction: column;
      min-width: 0;
    }
    .avatar {
      width: 56px;
      height: 56px;
      border-radius: 8px;
    }
    .muted {
      color: var(--mat-sys-on-surface-variant);
      font: var(--mat-sys-body-small);
    }
  `,
})
export class GamesWidget {
  protected readonly accounts = inject(GamesApi).accounts();

  protected dota(account: GameAccount): DotaSummary | null {
    return account.summary?.game === 'dota2' ? account.summary : null;
  }

  protected wow(account: GameAccount): WowSummary | null {
    return account.summary?.game === 'wow' ? account.summary : null;
  }
}

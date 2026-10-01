import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSnackBar } from '@angular/material/snack-bar';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { errorStatus } from '@pd/web-core';
import { firstValueFrom } from 'rxjs';
import { GamesApi } from './games.api';

/**
 * OpenDota API keys (optional, for Dota 2), in Settings → Integrations (see `integrations` in
 * games.module.ts): a key of its own for every Dota account.
 */
@Component({
  selector: 'pd-opendota-integration',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    TranslocoPipe,
  ],
  template: `
    <mat-card appearance="outlined">
      <mat-card-header>
        <mat-icon mat-card-avatar>sports_esports</mat-icon>
        <mat-card-title>OpenDota</mat-card-title>
        <mat-card-subtitle>{{ 'games.opendota.title' | transloco }}</mat-card-subtitle>
      </mat-card-header>
      <mat-card-content>
        <p class="hint">{{ 'games.opendota.hint' | transloco }}</p>
        @for (account of rows(); track account.id) {
          <div class="account">
            <span class="name">{{ account.displayName }}</span>
            @if (account.hasKey) {
              <span class="ok">
                <mat-icon inline>check_circle</mat-icon> {{ 'games.opendota.saved' | transloco }}
              </span>
              <button matButton [disabled]="busy()" (click)="remove(account.id)">
                {{ 'games.opendota.remove' | transloco }}
              </button>
            } @else {
              <mat-form-field subscriptSizing="dynamic">
                <mat-label>{{ 'games.opendota.label' | transloco }}</mat-label>
                <input #key matInput type="password" autocomplete="off" />
              </mat-form-field>
              <button
                matButton="filled"
                [disabled]="busy()"
                (click)="save(account.id, key.value); key.value = ''"
              >
                {{ 'core.actions.save' | transloco }}
              </button>
            }
          </div>
        } @empty {
          <p class="hint">{{ 'games.opendota.noAccounts' | transloco }}</p>
        }
      </mat-card-content>
    </mat-card>
  `,
  styles: `
    .account {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 8px 12px;
      padding: 8px 0;
      border-top: 1px solid var(--pd-border);
    }
    .name {
      flex: 1 1 140px;
      font-weight: 600;
    }
    .account mat-form-field {
      flex: 1 1 220px;
    }
    .hint {
      color: var(--mat-sys-on-surface-variant);
    }
    .ok {
      display: flex;
      align-items: center;
      gap: 6px;
      color: var(--mat-sys-primary);
    }
  `,
})
export class OpenDotaIntegration {
  private readonly api = inject(GamesApi);
  private readonly snackBar = inject(MatSnackBar);
  private readonly transloco = inject(TranslocoService);

  private readonly settings = this.api.settings();
  private readonly accounts = this.api.accounts();
  protected readonly busy = signal(false);

  /** The user's Dota accounts and whether each has a key. */
  protected readonly rows = computed(() => {
    const withKey = new Set(this.settings.value()?.openDotaKeyAccounts ?? []);
    return this.accounts
      .value()
      .filter((account) => account.game === 'dota2')
      .map(({ id, displayName }) => ({ id, displayName, hasKey: withKey.has(id) }));
  });

  /** The key is checked and the account is re-read with it — a few seconds. */
  async save(accountId: string, apiKey: string): Promise<void> {
    if (apiKey.trim().length < 10) {
      return;
    }
    this.busy.set(true);
    try {
      await firstValueFrom(this.api.saveOpenDotaKey(accountId, apiKey.trim()));
      this.settings.reload();
    } catch (error) {
      const key = errorStatus(error) === 400 ? 'games.opendota.invalid' : 'games.errors.generic';
      this.snackBar.open(this.transloco.translate(key), 'OK', { duration: 6000 });
    } finally {
      this.busy.set(false);
    }
  }

  async remove(accountId: string): Promise<void> {
    await firstValueFrom(this.api.removeOpenDotaKey(accountId));
    this.settings.reload();
  }
}

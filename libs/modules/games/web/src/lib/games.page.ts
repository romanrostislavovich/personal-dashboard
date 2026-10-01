import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTabsModule } from '@angular/material/tabs';
import { RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { GameAccountInput } from '@pd/contracts';
import { firstValueFrom } from 'rxjs';
import { errorStatus, INTEGRATIONS_LINK } from '@pd/web-core';
import { AddGameAccountDialog } from './add-account.dialog';
import { DotaDashboardComponent } from './dota/dota-dashboard.component';
import { GamesApi } from './games.api';
import { WowDashboardComponent } from './wow/wow-dashboard.component';

@Component({
  selector: 'pd-games-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    MatButtonModule,
    MatIconModule,
    MatProgressBarModule,
    MatTabsModule,
    RouterLink,
    TranslocoPipe,
    DotaDashboardComponent,
    WowDashboardComponent,
  ],
  templateUrl: './games.page.html',
  styleUrl: './games.page.scss',
})
export class GamesPage {
  private readonly api = inject(GamesApi);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);
  private readonly transloco = inject(TranslocoService);

  protected readonly accounts = this.api.accounts();
  protected readonly settings = this.api.settings();
  protected readonly busy = signal(false);

  /** Battle.net keys are in Settings → Integrations (battle-net.integration.ts). */
  protected readonly integrations = INTEGRATIONS_LINK;

  protected readonly dota = computed(() => this.accounts.value().filter((a) => a.game === 'dota2'));
  protected readonly wow = computed(() => this.accounts.value().filter((a) => a.game === 'wow'));
  protected readonly tabIndex = signal(0);

  async add(): Promise<void> {
    const input = await firstValueFrom(
      this.dialog
        .open<AddGameAccountDialog, void, GameAccountInput>(AddGameAccountDialog)
        .afterClosed(),
    );
    if (input) {
      await this.run(() => firstValueFrom(this.api.add(input)), {
        400: 'games.errors.notFound',
        409: 'games.errors.duplicate',
      });
    }
  }

  async sync(accountId: string): Promise<void> {
    await this.run(() => firstValueFrom(this.api.sync(accountId)));
  }

  async remove(accountId: string): Promise<void> {
    const name = this.accounts.value().find((a) => a.id === accountId)?.displayName;
    if (confirm(this.transloco.translate('games.confirmDelete', { name }))) {
      await this.run(() => firstValueFrom(this.api.remove(accountId)));
    }
  }

  /** Loading indicator, list refresh and a clear error by HTTP status. */
  private async run(action: () => Promise<unknown>, errorKeys: Record<number, string> = {}) {
    this.busy.set(true);
    try {
      await action();
      this.accounts.reload();
    } catch (error) {
      const key = errorKeys[errorStatus(error)];
      this.snackBar.open(this.transloco.translate(key ?? 'games.errors.generic'), 'OK', {
        duration: 6000,
      });
    } finally {
      this.busy.set(false);
    }
  }
}

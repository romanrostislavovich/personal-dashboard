import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTabsModule } from '@angular/material/tabs';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { GameAccountInput } from '@pd/contracts';
import { firstValueFrom } from 'rxjs';
import { AddGameAccountDialog } from './add-account.dialog';
import { DotaDashboardComponent } from './dota/dota-dashboard.component';
import { GamesApi } from './games.api';
import { WowDashboardComponent } from './wow/wow-dashboard.component';

@Component({
  selector: 'pd-games-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatProgressBarModule,
    MatTabsModule,
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

  protected readonly credentialsForm = inject(NonNullableFormBuilder).group({
    clientId: ['', [Validators.required, Validators.minLength(10)]],
    clientSecret: ['', [Validators.required, Validators.minLength(10)]],
  });

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

  async saveCredentials(): Promise<void> {
    await this.run(
      async () => {
        await firstValueFrom(this.api.saveWowCredentials(this.credentialsForm.getRawValue()));
        this.credentialsForm.reset();
        this.settings.reload();
      },
      { 400: 'games.errors.invalidCredentials' },
    );
  }

  /** Loading indicator, list refresh and a clear error by HTTP status. */
  private async run(action: () => Promise<unknown>, errorKeys: Record<number, string> = {}) {
    this.busy.set(true);
    try {
      await action();
      this.accounts.reload();
    } catch (error) {
      const key = error instanceof HttpErrorResponse ? errorKeys[error.status] : undefined;
      this.snackBar.open(this.transloco.translate(key ?? 'games.errors.generic'), 'OK', {
        duration: 6000,
      });
    } finally {
      this.busy.set(false);
    }
  }
}

import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { TranslocoPipe } from '@jsverse/transloco';
import { passwordStrength, WrongVaultPasswordError } from '@pd/client-core';
import { VaultSession } from './vault-session.service';

/**
 * Unlocking: the master password — or, forgotten, the recovery key with a new master password
 * at once (and the account password: only the owner sets the vault's keys).
 */
@Component({
  selector: 'pd-vault-unlock',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    MatButtonModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatProgressBarModule,
    TranslocoPipe,
  ],
  template: `
    <mat-card appearance="outlined" class="card">
      <mat-card-header>
        <mat-card-title>🔒 {{ 'vault.unlock.title' | transloco }}</mat-card-title>
      </mat-card-header>
      <form class="content" (ngSubmit)="submit()">
        @if (!recovering()) {
          <mat-form-field>
            <mat-label>{{ 'vault.unlock.master' | transloco }}</mat-label>
            <input
              matInput
              type="password"
              name="master"
              autocomplete="current-password"
              [ngModel]="master()"
              (ngModelChange)="master.set($event)"
            />
          </mat-form-field>
        } @else {
          <mat-form-field>
            <mat-label>{{ 'vault.unlock.recoveryKey' | transloco }}</mat-label>
            <input
              matInput
              name="recovery"
              autocomplete="off"
              [ngModel]="recoveryKey()"
              (ngModelChange)="recoveryKey.set($event)"
            />
          </mat-form-field>
          <mat-form-field>
            <mat-label>{{ 'vault.unlock.newMaster' | transloco }}</mat-label>
            <input
              matInput
              type="password"
              name="newMaster"
              autocomplete="new-password"
              [ngModel]="master()"
              (ngModelChange)="master.set($event)"
            />
            @if (master()) {
              <mat-hint>{{ 'vault.strength.' + strength() | transloco }}</mat-hint>
            }
          </mat-form-field>
          <mat-form-field>
            <mat-label>{{ 'vault.unlock.accountPassword' | transloco }}</mat-label>
            <input
              matInput
              type="password"
              name="account"
              autocomplete="off"
              [ngModel]="accountPassword()"
              (ngModelChange)="accountPassword.set($event)"
            />
          </mat-form-field>
        }
        @if (error(); as key) {
          <p class="error" role="alert">{{ key | transloco }}</p>
        }
        @if (busy()) {
          <p class="hint">{{ 'vault.unlock.unlocking' | transloco }}</p>
          <mat-progress-bar mode="indeterminate" />
        }
        <div class="actions">
          <button matButton type="button" (click)="toggle()">
            {{ (recovering() ? 'vault.unlock.back' : 'vault.unlock.forgot') | transloco }}
          </button>
          <button matButton="filled" type="submit" [disabled]="!ready() || busy()">
            {{ (recovering() ? 'vault.unlock.recover' : 'vault.unlock.unlock') | transloco }}
          </button>
        </div>
      </form>
    </mat-card>
  `,
  styles: `
    .card {
      max-width: 480px;
    }
    .content {
      display: flex;
      flex-direction: column;
      gap: 8px;
      padding: 12px 16px 16px;
    }
    .actions {
      display: flex;
      flex-wrap: wrap;
      justify-content: space-between;
      gap: 8px;
    }
    .hint {
      margin: 0;
      color: var(--mat-sys-on-surface-variant);
      font: var(--mat-sys-body-small);
    }
    .error {
      margin: 0;
      color: var(--mat-sys-error);
    }
  `,
})
export class VaultUnlockComponent {
  private readonly session = inject(VaultSession);

  protected readonly recovering = signal(false);
  protected readonly master = signal('');
  protected readonly recoveryKey = signal('');
  protected readonly accountPassword = signal('');
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly strength = computed(() => passwordStrength(this.master()).strength);
  protected readonly ready = computed(() =>
    this.recovering()
      ? this.recoveryKey().trim() !== '' &&
        this.master().length >= 12 &&
        this.strength() !== 'weak' &&
        this.accountPassword() !== ''
      : this.master() !== '',
  );

  protected toggle(): void {
    this.recovering.update((value) => !value);
    this.master.set('');
    this.error.set(null);
  }

  protected async submit(): Promise<void> {
    if (!this.ready()) {
      return;
    }
    this.busy.set(true);
    this.error.set(null);
    try {
      if (this.recovering()) {
        await this.session.recover(this.recoveryKey(), this.master(), this.accountPassword());
      } else {
        await this.session.unlock(this.master());
      }
      this.master.set('');
      this.accountPassword.set('');
    } catch (error) {
      // The vault refused the key or the password; anything else is the server refusing the
      // account password (only asked for when recovering).
      this.error.set(
        !(error instanceof WrongVaultPasswordError)
          ? 'vault.unlock.wrongAccount'
          : this.recovering()
            ? 'vault.unlock.wrongRecovery'
            : 'vault.unlock.wrong',
      );
    } finally {
      this.busy.set(false);
    }
  }
}

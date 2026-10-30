import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {MatButtonModule} from '@angular/material/button';
import {MatDialogModule, MatDialogRef} from '@angular/material/dialog';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatInputModule} from '@angular/material/input';
import {TranslocoPipe} from '@jsverse/transloco';
import {passwordStrength} from '@pd/client-core';
import {VaultSession} from './vault-session.service';

/** A new master password for the open vault; closes with `true` once it is changed. */
@Component({
  selector: 'pd-vault-master-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    MatButtonModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    TranslocoPipe,
  ],
  template: `
    <h2 mat-dialog-title>{{ 'vault.change.title' | transloco }}</h2>
    <mat-dialog-content class="form">
      <p class="hint">{{ 'vault.change.hint' | transloco }}</p>
      <mat-form-field>
        <mat-label>{{ 'vault.change.newMaster' | transloco }}</mat-label>
        <input
          matInput
          type="password"
          autocomplete="new-password"
          [ngModel]="master()"
          (ngModelChange)="master.set($event)"
        />
        @if (master()) {
          <mat-hint>{{ 'vault.strength.' + strength() | transloco }}</mat-hint>
        }
      </mat-form-field>
      <mat-form-field>
        <mat-label>{{ 'vault.change.repeat' | transloco }}</mat-label>
        <input
          matInput
          type="password"
          autocomplete="new-password"
          [ngModel]="repeat()"
          (ngModelChange)="repeat.set($event)"
        />
      </mat-form-field>
      <mat-form-field>
        <mat-label>{{ 'vault.change.accountPassword' | transloco }}</mat-label>
        <input
          matInput
          type="password"
          autocomplete="off"
          [ngModel]="account()"
          (ngModelChange)="account.set($event)"
        />
      </mat-form-field>
      @if (problem(); as key) {
        <p class="hint">{{ key | transloco }}</p>
      }
      @if (failed()) {
        <p class="error" role="alert">
          {{ 'vault.unlock.wrongAccount' | transloco }}
        </p>
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button matButton mat-dialog-close>
        {{ 'core.actions.cancel' | transloco }}
      </button>
      <button
        matButton="filled"
        [disabled]="!!problem() || !account() || busy()"
        (click)="save()"
      >
        {{ 'vault.change.save' | transloco }}
      </button>
    </mat-dialog-actions>
  `,
  styles: `
    .form {
      display: flex;
      flex-direction: column;
      gap: 4px;
      min-width: min(440px, 80vw);
    }
    .hint {
      margin: 0 0 8px;
      color: var(--mat-sys-on-surface-variant);
      font: var(--mat-sys-body-small);
    }
    .error {
      color: var(--mat-sys-error);
    }
  `,
})
export class VaultMasterDialog {
  private readonly session = inject(VaultSession);
  private readonly ref = inject(MatDialogRef<VaultMasterDialog, boolean>);

  protected readonly master = signal('');
  protected readonly repeat = signal('');
  protected readonly account = signal('');
  protected readonly busy = signal(false);
  protected readonly failed = signal(false);
  protected readonly strength = computed(
    () => passwordStrength(this.master()).strength,
  );
  protected readonly problem = computed(() => {
    if (this.master().length < 12) {
      return 'vault.setup.short';
    }
    if (this.strength() === 'weak') {
      return 'vault.setup.weakMaster';
    }
    return this.master() === this.repeat() ? null : 'vault.setup.mismatch';
  });

  protected async save(): Promise<void> {
    this.busy.set(true);
    this.failed.set(false);
    try {
      await this.session.changeMasterPassword(this.master(), this.account());
      this.ref.close(true);
    } catch {
      this.failed.set(true);
    } finally {
      this.busy.set(false);
    }
  }
}

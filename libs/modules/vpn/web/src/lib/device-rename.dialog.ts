import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {MatButtonModule} from '@angular/material/button';
import {
  MAT_DIALOG_DATA,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatInputModule} from '@angular/material/input';
import {TranslocoPipe} from '@jsverse/transloco';
import {VpnDevice} from '@pd/contracts';
import {firstValueFrom} from 'rxjs';
import {VpnApi} from './vpn.api';
import {vpnErrorKey} from './vpn-errors';

/**
 * A device's new name. A dialog of its own, not `prompt()`: the desktop app (Electron) has no
 * `prompt()` — it returned nothing there, and the rename never happened. Closes with `true`.
 */
@Component({
  selector: 'pd-vpn-device-rename-dialog',
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
    <h2 mat-dialog-title>{{ 'vpn.devices.rename' | transloco }}</h2>
    <mat-dialog-content class="form">
      <mat-form-field>
        <mat-label>{{ 'vpn.add.name' | transloco }}</mat-label>
        <input
          matInput
          cdkFocusInitial
          maxlength="60"
          [(ngModel)]="name"
          (keydown.enter)="save()"
        />
      </mat-form-field>
      @if (error(); as key) {
        <p class="error" role="alert">{{ key | transloco }}</p>
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button matButton mat-dialog-close>
        {{ 'core.actions.cancel' | transloco }}
      </button>
      <button
        matButton="filled"
        [disabled]="!name().trim() || saving()"
        (click)="save()"
      >
        {{ 'core.actions.save' | transloco }}
      </button>
    </mat-dialog-actions>
  `,
  styles: `
    .form {
      min-width: min(360px, 84vw);
    }
    .error {
      margin: 0;
      color: var(--mat-sys-error);
    }
  `,
})
export class VpnDeviceRenameDialog {
  private readonly device = inject<VpnDevice>(MAT_DIALOG_DATA);
  private readonly api = inject(VpnApi);
  private readonly dialogRef = inject(
    MatDialogRef<VpnDeviceRenameDialog, boolean>,
  );
  protected readonly name = signal(this.device.name);
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);

  protected async save(): Promise<void> {
    const name = this.name().trim();
    if (!name || this.saving()) {
      return;
    }
    if (name === this.device.name) {
      this.dialogRef.close(false);
      return;
    }
    this.saving.set(true);
    this.error.set(null);
    try {
      await firstValueFrom(this.api.updateDevice(this.device.id, {name}));
      this.dialogRef.close(true);
    } catch (error) {
      this.error.set(vpnErrorKey(error));
    } finally {
      this.saving.set(false);
    }
  }
}

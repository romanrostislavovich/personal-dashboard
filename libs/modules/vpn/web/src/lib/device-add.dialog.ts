import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {MatButtonModule} from '@angular/material/button';
import {MatButtonToggleModule} from '@angular/material/button-toggle';
import {MatDialogModule, MatDialogRef} from '@angular/material/dialog';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatIconModule} from '@angular/material/icon';
import {MatInputModule} from '@angular/material/input';
import {TranslocoPipe} from '@jsverse/transloco';
import {VPN_DEVICE_KINDS, VpnDevice, VpnDeviceKind} from '@pd/contracts';
import {firstValueFrom} from 'rxjs';
import {VpnApi} from './vpn.api';
import {KIND_ICONS} from './vpn-kinds';

/** A new device: its name and kind. Saves by itself and closes with the device. */
@Component({
  selector: 'pd-vpn-device-add-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    MatButtonModule,
    MatButtonToggleModule,
    MatDialogModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    TranslocoPipe,
  ],
  template: `
    <h2 mat-dialog-title>{{ 'vpn.add.title' | transloco }}</h2>
    <mat-dialog-content class="form">
      <mat-form-field>
        <mat-label>{{ 'vpn.add.name' | transloco }}</mat-label>
        <input
          matInput
          cdkFocusInitial
          maxlength="60"
          [placeholder]="'vpn.add.namePlaceholder' | transloco"
          [(ngModel)]="name"
          (keydown.enter)="save()"
        />
      </mat-form-field>
      <mat-button-toggle-group
        hideSingleSelectionIndicator
        [attr.aria-label]="'vpn.add.kind' | transloco"
        [(ngModel)]="kind"
      >
        @for (option of kinds; track option) {
          <mat-button-toggle [value]="option">
            <mat-icon>{{ icons[option] }}</mat-icon>
            {{ 'vpn.kind.' + option | transloco }}
          </mat-button-toggle>
        }
      </mat-button-toggle-group>
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
        {{ 'vpn.add.save' | transloco }}
      </button>
    </mat-dialog-actions>
  `,
  styles: `
    .form {
      display: flex;
      flex-direction: column;
      gap: 12px;
      min-width: min(380px, 84vw);
    }
    mat-button-toggle-group {
      align-self: flex-start;
      flex-wrap: wrap;
    }
  `,
})
export class VpnDeviceAddDialog {
  private readonly api = inject(VpnApi);
  private readonly dialogRef = inject(
    MatDialogRef<VpnDeviceAddDialog, VpnDevice>,
  );
  protected readonly kinds = VPN_DEVICE_KINDS;
  protected readonly icons = KIND_ICONS;
  protected readonly name = signal('');
  protected readonly kind = signal<VpnDeviceKind>('phone');
  protected readonly saving = signal(false);

  protected async save(): Promise<void> {
    const name = this.name().trim();
    if (!name || this.saving()) {
      return;
    }
    this.saving.set(true);
    try {
      this.dialogRef.close(
        await firstValueFrom(this.api.addDevice({name, kind: this.kind()})),
      );
    } finally {
      this.saving.set(false);
    }
  }
}

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
import {vpnErrorKey} from './vpn-errors';
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
          <mat-button-toggle
            [value]="option"
            [attr.aria-label]="'vpn.kind.' + option | transloco"
          >
            <mat-icon>{{ icons[option] }}</mat-icon>
            <span class="kind-label">{{
              'vpn.kind.' + option | transloco
            }}</span>
          </mat-button-toggle>
        }
      </mat-button-toggle-group>
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
    }
    /* A phone's dialog has no room for three words: the icons stay, named for screen readers. */
    @media (max-width: 420px) {
      .kind-label {
        display: none;
      }
    }
    .error {
      margin: 0;
      color: var(--mat-sys-error);
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
  protected readonly error = signal<string | null>(null);

  protected async save(): Promise<void> {
    const name = this.name().trim();
    if (!name || this.saving()) {
      return;
    }
    this.saving.set(true);
    this.error.set(null);
    try {
      this.dialogRef.close(
        await firstValueFrom(this.api.addDevice({name, kind: this.kind()})),
      );
    } catch (error) {
      this.error.set(vpnErrorKey(error));
    } finally {
      this.saving.set(false);
    }
  }
}

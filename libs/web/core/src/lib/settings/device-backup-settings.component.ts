import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';
import { TranslocoPipe } from '@jsverse/transloco';
import { DeviceBackupService } from '../backup/device-backup.service';

const KEEP_OPTIONS = [7, 14, 30, 90];

/**
 * The copies of one's data kept on this device (see DeviceBackupService): when the last one
 * was made, where they are, how many are kept. Shown only where the device keeps them.
 */
@Component({
  selector: 'pd-device-backup-settings',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    MatButtonModule,
    MatCardModule,
    MatFormFieldModule,
    MatIconModule,
    MatProgressBarModule,
    MatSelectModule,
    TranslocoPipe,
  ],
  template: `
    @if (backup.device) {
      <mat-card appearance="outlined">
        <mat-card-header>
          <mat-card-title>💾 {{ 'core.settings.deviceBackup.title' | transloco }}</mat-card-title>
          <mat-card-subtitle>
            {{ 'core.settings.deviceBackup.subtitle' | transloco }}
          </mat-card-subtitle>
        </mat-card-header>
        <mat-card-content class="content">
          @if (backup.status(); as status) {
            @if (status.copies[0]; as newest) {
              <p>
                {{
                  'core.settings.deviceBackup.latest'
                    | transloco
                      : {
                          date: (newest.savedAt | date: 'd MMM y, HH:mm'),
                          size: megabytes(newest.size),
                          count: status.copies.length,
                        }
                }}
              </p>
            } @else {
              <p>{{ 'core.settings.deviceBackup.none' | transloco }}</p>
            }
            <p class="hint folder">{{ status.folder }}</p>
            <mat-form-field subscriptSizing="dynamic" class="keep">
              <mat-label>{{ 'core.settings.deviceBackup.keep' | transloco }}</mat-label>
              <mat-select [value]="status.keep" (selectionChange)="backup.setKeep($event.value)">
                @for (keep of keepOptions; track keep) {
                  <mat-option [value]="keep">{{ keep }}</mat-option>
                }
              </mat-select>
            </mat-form-field>
          }
          @if (backup.busy()) {
            <p class="hint">{{ 'core.settings.deviceBackup.making' | transloco }}</p>
            <mat-progress-bar mode="indeterminate" />
          }
          @if (backup.error(); as error) {
            <p class="error" role="alert">
              {{ 'core.settings.deviceBackup.failed' | transloco: { error } }}
            </p>
          }
          <p class="hint">{{ 'core.settings.deviceBackup.hint' | transloco }}</p>
          <div class="actions">
            <button matButton="filled" [disabled]="backup.busy()" (click)="backup.makeNow()">
              <mat-icon>backup</mat-icon> {{ 'core.settings.deviceBackup.now' | transloco }}
            </button>
            <button matButton="outlined" (click)="backup.device.openFolder()">
              <mat-icon>folder_open</mat-icon> {{ 'core.settings.deviceBackup.open' | transloco }}
            </button>
            <button matButton (click)="backup.chooseFolder()">
              {{ 'core.settings.deviceBackup.change' | transloco }}
            </button>
          </div>
        </mat-card-content>
      </mat-card>
    }
  `,
  styles: `
    .content {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    p {
      margin: 0;
    }
    .folder {
      overflow-wrap: anywhere;
    }
    .keep {
      width: 200px;
    }
    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }
    .hint {
      color: var(--mat-sys-on-surface-variant);
      font: var(--mat-sys-body-small);
    }
    .error {
      color: var(--mat-sys-error);
    }
  `,
})
export class DeviceBackupSettingsComponent {
  protected readonly backup = inject(DeviceBackupService);
  protected readonly keepOptions = KEEP_OPTIONS;

  constructor() {
    void this.backup.refresh();
  }

  protected megabytes(bytes: number): string {
    return (bytes / 1_048_576).toFixed(1);
  }
}

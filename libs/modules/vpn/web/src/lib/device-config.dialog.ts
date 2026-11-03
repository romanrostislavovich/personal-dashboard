import {
  ChangeDetectionStrategy,
  Component,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import {MatButtonModule} from '@angular/material/button';
import {MAT_DIALOG_DATA, MatDialogModule} from '@angular/material/dialog';
import {MatIconModule} from '@angular/material/icon';
import {MatProgressSpinnerModule} from '@angular/material/progress-spinner';
import {TranslocoPipe} from '@jsverse/transloco';
import {VpnDevice} from '@pd/contracts';
import QRCode from 'qrcode';
import {firstValueFrom} from 'rxjs';
import {VpnApi} from './vpn.api';

/**
 * A device's config: a QR code for the phone's app, a file for a computer. It holds the
 * device's key — whoever sees it can use the VPN as that device.
 */
@Component({
  selector: 'pd-vpn-device-config-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    MatButtonModule,
    MatDialogModule,
    MatIconModule,
    MatProgressSpinnerModule,
    TranslocoPipe,
  ],
  template: `
    <h2 mat-dialog-title>{{ device.name }}</h2>
    <mat-dialog-content class="content">
      @if (qr(); as src) {
        <img
          class="qr"
          [src]="src"
          [alt]="'vpn.config.qrAlt' | transloco: {name: device.name}"
        />
      } @else if (failed()) {
        <p role="alert">{{ 'vpn.config.failed' | transloco }}</p>
      } @else {
        <mat-spinner diameter="40" />
      }
      <p class="hint">{{ hintKey | transloco }}</p>
      <p class="secret">
        <mat-icon inline>key</mat-icon>
        {{ 'vpn.config.secret' | transloco }}
      </p>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button matButton [disabled]="!text()" (click)="download()">
        <mat-icon>download</mat-icon> {{ 'vpn.config.download' | transloco }}
      </button>
      <button matButton="filled" mat-dialog-close>
        {{ 'core.actions.close' | transloco }}
      </button>
    </mat-dialog-actions>
  `,
  styles: `
    .content {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 8px;
      max-width: 420px;
    }
    .qr {
      width: min(320px, 70vw);
      aspect-ratio: 1;
      background: #fff;
      border-radius: 12px;
      padding: 8px;
    }
    .hint {
      font: var(--mat-sys-body-medium);
    }
    .secret {
      font: var(--mat-sys-body-small);
      color: var(--mat-sys-on-surface-variant);
    }
  `,
})
export class VpnDeviceConfigDialog implements OnInit {
  protected readonly device = inject<VpnDevice>(MAT_DIALOG_DATA);
  private readonly api = inject(VpnApi);
  protected readonly text = signal<string | null>(null);
  protected readonly qr = signal<string | null>(null);
  protected readonly failed = signal(false);
  protected readonly hintKey =
    this.device.kind === 'phone'
      ? 'vpn.config.phoneHint'
      : 'vpn.config.computerHint';

  async ngOnInit(): Promise<void> {
    try {
      const {config} = await firstValueFrom(this.api.config(this.device.id));
      this.text.set(config);
      // Black on white whatever the theme: a camera reads it in the dark too.
      this.qr.set(
        await QRCode.toDataURL(config, {
          errorCorrectionLevel: 'M',
          margin: 1,
          width: 640,
        }),
      );
    } catch {
      this.failed.set(true);
    }
  }

  /** `<name>.conf` for the AmneziaWG app on a computer ("Import tunnel from file"). */
  protected download(): void {
    const text = this.text();
    if (!text) {
      return;
    }
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([text], {type: 'text/plain'}));
    // The app names the tunnel after the file: Latin letters, digits, `-` and `_`.
    link.download = `${this.device.name.replace(/[^\w-]+/g, '_').slice(0, 15) || 'vpn'}.conf`;
    link.click();
    URL.revokeObjectURL(link.href);
  }
}

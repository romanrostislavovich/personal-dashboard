import {DatePipe} from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
} from '@angular/core';
import {MatButtonModule} from '@angular/material/button';
import {MatCardModule} from '@angular/material/card';
import {MatDialog} from '@angular/material/dialog';
import {MatIconModule} from '@angular/material/icon';
import {MatTooltipModule} from '@angular/material/tooltip';
import {TranslocoPipe, TranslocoService} from '@jsverse/transloco';
import {VpnDevice} from '@pd/contracts';
import {
  Bar,
  BarChartComponent,
  EmptyStateComponent,
  IntegrationGuideComponent,
  ResourceStateComponent,
} from '@pd/web-core';
import {firstValueFrom} from 'rxjs';
import {VpnDeviceAddDialog} from './device-add.dialog';
import {VpnDeviceConfigDialog} from './device-config.dialog';
import {formatBytes} from './format-bytes';
import {VpnApi} from './vpn.api';
import {KIND_ICONS} from './vpn-kinds';

const CHART_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

/** The VPN: is it running, the devices with their QR codes, the traffic of a month, how to set up. */
@Component({
  selector: 'pd-vpn-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    MatButtonModule,
    MatCardModule,
    MatIconModule,
    MatTooltipModule,
    TranslocoPipe,
    BarChartComponent,
    EmptyStateComponent,
    IntegrationGuideComponent,
    ResourceStateComponent,
  ],
  templateUrl: './vpn.page.html',
  styleUrl: './vpn.page.scss',
})
export class VpnPage {
  private readonly api = inject(VpnApi);
  private readonly dialog = inject(MatDialog);
  private readonly transloco = inject(TranslocoService);
  protected readonly status = this.api.status();
  protected readonly days = this.api.days(() => CHART_DAYS);
  protected readonly icons = KIND_ICONS;

  protected readonly online = computed(
    () =>
      this.status.value()?.devices.filter(device => device.online).length ?? 0,
  );

  /** Every day of the month, the quiet ones as empty bars. */
  protected readonly bars = computed<Bar[]>(() => {
    const locale = this.transloco.getActiveLang();
    const byDay = new Map(
      this.days.value().map(day => [day.day, day.rxBytes + day.txBytes]),
    );
    const today = new Date();
    return Array.from({length: CHART_DAYS}, (_, index) => {
      const date = new Date(
        today.getTime() - (CHART_DAYS - 1 - index) * DAY_MS,
      );
      const key = date.toLocaleDateString('sv');
      const value = byDay.get(key) ?? 0;
      const label = date.toLocaleDateString(locale, {
        day: 'numeric',
        month: 'short',
      });
      return {
        label: index % 7 === CHART_DAYS % 7 ? label : '',
        value,
        title: `${label} — ${formatBytes(value, locale)}`,
      };
    });
  });

  protected readonly formatAxis = (value: number) =>
    formatBytes(value, this.transloco.getActiveLang());

  protected bytes(value: number): string {
    return formatBytes(value, this.transloco.getActiveLang());
  }

  protected async add(): Promise<void> {
    const device = await firstValueFrom(
      this.dialog.open(VpnDeviceAddDialog).afterClosed(),
    );
    if (device) {
      this.status.reload();
      this.showConfig(device);
    }
  }

  protected showConfig(device: VpnDevice): void {
    this.dialog.open(VpnDeviceConfigDialog, {data: device});
  }

  protected async rename(device: VpnDevice): Promise<void> {
    const name = prompt(
      this.transloco.translate('vpn.devices.renamePrompt'),
      device.name,
    )?.trim();
    if (!name || name === device.name) {
      return;
    }
    await firstValueFrom(this.api.renameDevice(device.id, {name}));
    this.status.reload();
  }

  protected async remove(device: VpnDevice): Promise<void> {
    if (
      !confirm(
        this.transloco.translate('vpn.devices.deleteConfirm', {
          name: device.name,
        }),
      )
    ) {
      return;
    }
    await firstValueFrom(this.api.removeDevice(device.id));
    this.status.reload();
    this.days.reload();
  }
}

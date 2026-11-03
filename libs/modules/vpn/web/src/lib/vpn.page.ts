import {DatePipe} from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  signal,
} from '@angular/core';
import {MatButtonModule} from '@angular/material/button';
import {MatCardModule} from '@angular/material/card';
import {MatDialog} from '@angular/material/dialog';
import {MatIconModule} from '@angular/material/icon';
import {MatSnackBar} from '@angular/material/snack-bar';
import {MatTooltipModule} from '@angular/material/tooltip';
import {TranslocoPipe, TranslocoService} from '@jsverse/transloco';
import {addDays, parseLocalDate, toLocalDate, VpnDevice} from '@pd/contracts';
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
import {VpnDeviceRenameDialog} from './device-rename.dialog';
import {formatBytes} from './format-bytes';
import {VpnApi} from './vpn.api';
import {vpnErrorKey} from './vpn-errors';
import {KIND_ICONS} from './vpn-kinds';

const CHART_DAYS = 30;
/** Who is online changes by the minute: the page looks again as often. */
const REFRESH_MS = 60_000;

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
  private readonly snackBar = inject(MatSnackBar);
  private readonly transloco = inject(TranslocoService);
  protected readonly status = this.api.status();
  protected readonly days = this.api.days(() => CHART_DAYS);
  protected readonly icons = KIND_ICONS;
  /** The device a change is being sent for: its buttons wait. */
  protected readonly busy = signal<string | null>(null);

  constructor() {
    const timer = setInterval(() => {
      this.status.reload();
      this.days.reload();
    }, REFRESH_MS);
    inject(DestroyRef).onDestroy(() => clearInterval(timer));
  }

  protected readonly online = computed(
    () =>
      this.status.value()?.devices.filter(device => device.online).length ?? 0,
  );

  /**
   * Every day of the month up to today in the user's time zone (the server's days are in it),
   * the quiet ones as empty bars; the day's number under every seventh, today's included.
   */
  protected readonly bars = computed<Bar[]>(() => {
    const today = this.status.value()?.today;
    if (!today) {
      return [];
    }
    const locale = this.transloco.getActiveLang();
    const byDay = new Map(
      this.days.value().map(day => [day.day, day.rxBytes + day.txBytes]),
    );
    return Array.from({length: CHART_DAYS}, (_, index) => {
      const parts = addDays(parseLocalDate(today), index - (CHART_DAYS - 1));
      const value = byDay.get(toLocalDate(parts)) ?? 0;
      const label = new Date(
        Date.UTC(parts.year, parts.month - 1, parts.day),
      ).toLocaleDateString(locale, {
        day: 'numeric',
        month: 'short',
        timeZone: 'UTC',
      });
      return {
        // Only the day's number fits a phone's column.
        label: (CHART_DAYS - 1 - index) % 7 === 0 ? String(parts.day) : '',
        value,
        title: `${label} — ${formatBytes(value, locale)}`,
      };
    });
  });

  /** The history stays after the devices are gone: the chart shows while there is any. */
  protected readonly hasTraffic = computed(() => this.days.value().length > 0);

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
    const renamed = await firstValueFrom(
      this.dialog.open(VpnDeviceRenameDialog, {data: device}).afterClosed(),
    );
    if (renamed) {
      this.status.reload();
    }
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
    await this.change(device, () =>
      firstValueFrom(this.api.removeDevice(device.id)),
    );
    this.days.reload();
  }

  /** One change at a time per device; a refusal is told, not swallowed. */
  private async change(
    device: VpnDevice,
    send: () => Promise<unknown>,
  ): Promise<void> {
    this.busy.set(device.id);
    try {
      await send();
      this.status.reload();
    } catch (error) {
      this.snackBar.open(
        this.transloco.translate(vpnErrorKey(error)),
        this.transloco.translate('core.actions.ok'),
        {duration: 6000},
      );
    } finally {
      this.busy.set(null);
    }
  }
}

import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
} from '@angular/core';
import {MatButtonModule} from '@angular/material/button';
import {MatCardModule} from '@angular/material/card';
import {MatIconModule} from '@angular/material/icon';
import {RouterLink} from '@angular/router';
import {TranslocoPipe, TranslocoService} from '@jsverse/transloco';
import {needsSetup} from '@pd/web-core';
import {formatBytes} from './format-bytes';
import {VpnApi} from './vpn.api';
import {KIND_ICONS} from './vpn-kinds';

/** Home widget: is the VPN running, which devices are in it now, today's traffic. */
@Component({
  selector: 'pd-vpn-widget',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    MatButtonModule,
    MatCardModule,
    MatIconModule,
    RouterLink,
    TranslocoPipe,
  ],
  template: `
    <mat-card appearance="outlined">
      <mat-card-header>
        <mat-card-title>🔐 {{ 'vpn.title' | transloco }}</mat-card-title>
      </mat-card-header>
      <mat-card-content>
        @if (status.value(); as vpn) {
          <p class="state" [class]="vpn.state">
            <span class="dot" aria-hidden="true"></span>
            {{ 'vpn.state.' + vpn.state | transloco }}
            <span class="today">{{ today() }}</span>
          </p>
          @for (device of online(); track device.id) {
            <div class="device">
              <mat-icon inline>{{ icons[device.kind] }}</mat-icon>
              {{ device.name }}
            </div>
          } @empty {
            <p class="empty">{{ 'vpn.widget.nobody' | transloco }}</p>
          }
        }
      </mat-card-content>
      <mat-card-actions align="end">
        <a matButton routerLink="/vpn">{{ 'vpn.widget.open' | transloco }}</a>
      </mat-card-actions>
    </mat-card>
  `,
  styles: `
    .state {
      display: flex;
      align-items: center;
      gap: 8px;
      margin: 0 0 8px;
      font: var(--mat-sys-title-small);
    }
    .dot {
      width: 10px;
      height: 10px;
      border-radius: 50%;
      background: var(--mat-sys-outline);
    }
    .up .dot {
      background: var(--pd-success, #2e7d32);
    }
    .down .dot {
      background: var(--mat-sys-error);
    }
    .today {
      margin-left: auto;
      color: var(--mat-sys-on-surface-variant);
      font: var(--mat-sys-label-large);
    }
    .device {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 4px 0;
    }
    .empty {
      color: var(--mat-sys-on-surface-variant);
      margin: 0;
    }
  `,
})
export class VpnWidget {
  protected readonly status = inject(VpnApi).status();
  private readonly transloco = inject(TranslocoService);
  protected readonly icons = KIND_ICONS;

  constructor() {
    needsSetup(
      () =>
        !this.status.isLoading() &&
        (this.status.value()?.state ?? 'off') === 'off',
    );
  }

  protected readonly online = computed(
    () => this.status.value()?.devices.filter(device => device.online) ?? [],
  );

  protected readonly today = computed(() =>
    formatBytes(
      this.status.value()?.todayBytes ?? 0,
      this.transloco.getActiveLang(),
    ),
  );
}

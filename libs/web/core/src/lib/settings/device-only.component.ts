import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { TranslocoPipe } from '@jsverse/transloco';
import { isMobileApp } from '../mobile/mobile-app';
import { desktopBridge } from '../realtime/desktop-bridge';

export type DeviceKind = 'phone' | 'desktop';

/**
 * The mark of a setting that belongs to one kind of device: the phone (the Android app) or the
 * computer (the desktop app). Settings look the same on every device; such a one is still shown
 * everywhere, in a colour of its kind, with a word on where it is changed.
 */
@Component({
  selector: 'pd-device-only',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatIconModule, TranslocoPipe],
  template: `
    <p class="mark" [class]="kind()">
      <mat-icon inline>{{ kind() === 'phone' ? 'smartphone' : 'computer' }}</mat-icon>
      <span>
        <b>{{ 'core.settings.deviceOnly.' + kind() + '.title' | transloco }}</b>
        —
        {{
          (here()
            ? 'core.settings.deviceOnly.' + kind() + '.here'
            : 'core.settings.deviceOnly.' + kind() + '.elsewhere'
          ) | transloco
        }}
      </span>
    </p>
  `,
  styles: `
    .mark {
      display: flex;
      align-items: flex-start;
      gap: 8px;
      margin: 8px 0;
      padding: 8px 12px;
      border-radius: 8px;
      font: var(--mat-sys-body-small);
    }
    /* A soft tint and a stripe of the kind's colour: a theme's container colours can be loud. */
    .phone {
      --pd-device: var(--mat-sys-tertiary);
    }
    .desktop {
      --pd-device: var(--mat-sys-primary);
    }
    .phone,
    .desktop {
      background: color-mix(in srgb, var(--pd-device) 10%, transparent);
      border-left: 4px solid var(--pd-device);
      color: var(--mat-sys-on-surface);
    }
    .phone mat-icon,
    .desktop mat-icon {
      color: var(--pd-device);
    }
    mat-icon {
      flex: none;
      margin-top: 1px;
    }
  `,
})
export class DeviceOnlyComponent {
  readonly kind = input.required<DeviceKind>();
  /** Whether the dashboard is open on that kind of device now. */
  readonly here = computed(() => isOnDevice(this.kind()));
}

export function isOnDevice(kind: DeviceKind): boolean {
  return kind === 'phone' ? isMobileApp() : desktopBridge() !== null;
}

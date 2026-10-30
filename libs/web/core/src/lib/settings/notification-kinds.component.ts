import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
} from '@angular/core';
import {MatCardModule} from '@angular/material/card';
import {MatCheckboxModule} from '@angular/material/checkbox';
import {MatIconModule} from '@angular/material/icon';
import {TranslocoPipe} from '@jsverse/transloco';
import {MUTABLE_CHANNELS, MutableChannel, NO_CALM} from '@pd/contracts';
import {AuthService} from '../auth/auth.service';
import {DASHBOARD_MODULES} from '../dashboard-module';

interface Kind {
  /** The section's id, as notifications name their source. */
  id: string;
  labelKey: string;
  icon: string;
}

/**
 * Which sections may reach the user away from the screen: each one's notifications to Telegram
 * and to the phone, on or off (`muted` of the gentle mode, every device). An open tab still
 * shows them, and the delivery log keeps them.
 */
@Component({
  selector: 'pd-notification-kinds',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatCardModule, MatCheckboxModule, MatIconModule, TranslocoPipe],
  template: `
    <mat-card appearance="outlined">
      <mat-card-header>
        <mat-icon mat-card-avatar>tune</mat-icon>
        <mat-card-title>{{
          'core.settings.kinds.title' | transloco
        }}</mat-card-title>
        <mat-card-subtitle>{{
          'core.settings.kinds.hint' | transloco
        }}</mat-card-subtitle>
      </mat-card-header>
      <mat-card-content>
        <div class="row head">
          <span></span>
          @for (channel of channels; track channel) {
            <span class="channel">{{
              'core.settings.kinds.' + channel | transloco
            }}</span>
          }
        </div>
        @for (kind of kinds; track kind.id) {
          <div class="row">
            <span class="name">
              <mat-icon inline>{{ kind.icon }}</mat-icon>
              {{ kind.labelKey | transloco }}
            </span>
            @for (channel of channels; track channel) {
              <mat-checkbox
                class="channel"
                [checked]="!isMuted(kind.id, channel)"
                (change)="set(kind.id, channel, $event.checked)"
                [attr.aria-label]="
                  (kind.labelKey | transloco) +
                  ' — ' +
                  ('core.settings.kinds.' + channel | transloco)
                "
              />
            }
          </div>
        }
      </mat-card-content>
    </mat-card>
  `,
  styles: `
    .row {
      display: grid;
      grid-template-columns: 1fr 88px 88px;
      align-items: center;
      border-bottom: 1px solid var(--mat-sys-outline-variant);
      min-height: 44px;
    }
    .head {
      font: var(--mat-sys-label-medium);
      color: var(--mat-sys-on-surface-variant);
    }
    .name {
      display: flex;
      align-items: center;
      gap: 8px;
      min-width: 0;
    }
    .channel {
      justify-self: center;
      text-align: center;
    }
  `,
})
export class NotificationKindsComponent {
  private readonly auth = inject(AuthService);
  private readonly calm = computed(() => this.auth.user()?.calm ?? NO_CALM);

  protected readonly channels = MUTABLE_CHANNELS;
  /** Every section of the menu, then the dashboard's own messages (sync, backups, security). */
  protected readonly kinds: Kind[] = [
    ...inject(DASHBOARD_MODULES)
      .filter(module => module.nav)
      .map(module => ({
        id: module.id,
        labelKey: module.nav?.labelKey ?? module.id,
        icon: module.nav?.icon ?? 'notifications',
      })),
    {id: 'core', labelKey: 'core.settings.kinds.core', icon: 'dashboard'},
  ];

  protected isMuted(section: string, channel: MutableChannel): boolean {
    return (this.calm().muted?.[section] ?? []).includes(channel);
  }

  protected set(
    section: string,
    channel: MutableChannel,
    on: boolean,
  ): Promise<void> {
    const muted = {...(this.calm().muted ?? {})};
    const left = (muted[section] ?? []).filter(one => one !== channel);
    muted[section] = on ? left : [...left, channel];
    if (!muted[section].length) {
      delete muted[section];
    }
    return this.auth.updateProfile({calm: {...this.calm(), muted}});
  }
}

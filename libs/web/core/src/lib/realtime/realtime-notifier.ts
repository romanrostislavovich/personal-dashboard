import {DestroyRef, inject, Injectable} from '@angular/core';
import {Router} from '@angular/router';
import {TranslocoService} from '@jsverse/transloco';
import {RealtimeEvent} from '@pd/contracts';
import {ToastService} from '../toast/toast.service';
import {desktopBridge, VPN_THIS_COMPUTER_KEY} from './desktop-bridge';
import {RealtimeClient} from './realtime.client';

import {desktopNotificationsOn} from './desktop-notifications';

/**
 * Turns live events into what the user sees: a toast in the page, and in the desktop app
 * also a system notification when the window is hidden or not in focus.
 */
@Injectable({providedIn: 'root'})
export class RealtimeNotifier {
  private readonly toasts = inject(ToastService);
  private readonly transloco = inject(TranslocoService);
  private readonly router = inject(Router);
  private readonly client = inject(RealtimeClient);
  private readonly destroyRef = inject(DestroyRef);
  private readonly desktop = desktopBridge();
  private started = false;

  start(): void {
    if (this.started) {
      return;
    }
    this.started = true;
    const subscription = this.client.events$.subscribe(event =>
      this.show(event),
    );
    this.destroyRef.onDestroy(() => subscription.unsubscribe());
    this.desktop?.onNavigate?.(route => void this.router.navigateByUrl(route));
  }

  /**
   * "Turn the VPN on on the laptop" (the assistant, Telegram, another page): only the desktop
   * app of that computer acts — the one whose VPN page named it as this device.
   */
  private switchVpn(event: Extract<RealtimeEvent, {type: 'vpn'}>): void {
    const vpn = this.desktop?.vpn;
    let mine: string | null = null;
    try {
      mine = localStorage.getItem(VPN_THIS_COMPUTER_KEY);
    } catch {
      return;
    }
    if (!vpn || mine !== event.deviceId) {
      return;
    }
    void (event.up ? vpn.start(event.killSwitch) : vpn.stop());
  }

  private show(event: RealtimeEvent): void {
    if (event.type === 'vpn') {
      this.switchVpn(event);
      return;
    }
    if (event.type === 'achievements') {
      const label = this.transloco.translate('core.toast.achievement');
      for (const achievement of event.achievements) {
        const rarity = this.transloco.translate(
          `core.toast.rarity.${achievement.rarity}`,
        );
        this.toasts.show({
          icon: achievement.icon,
          label,
          title: achievement.title,
          text: `${achievement.description} · ${rarity} · +${achievement.xp} XP`,
          rarity: achievement.rarity,
          route: '/achievements',
        });
        this.notifyDesktop(
          `${label} ${achievement.icon}`,
          achievement.title,
          '/achievements',
        );
      }
    } else if (event.type === 'notification') {
      this.toasts.show({
        icon: '🔔',
        title: event.title,
        text: event.body,
        route: event.route,
      });
      // Not in the quiet hours, not for a section kept off the computer (the server tells).
      if (event.system !== false) {
        this.notifyDesktop(event.title, event.body, event.route);
      }
    }
  }

  /** A system notification only when the user might miss the toast. */
  private notifyDesktop(title: string, body: string, route?: string): void {
    if (
      this.desktop?.notify &&
      desktopNotificationsOn() &&
      (document.hidden || !document.hasFocus())
    ) {
      this.desktop.notify({title, body, route});
    }
  }
}

import { DestroyRef, inject, Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { TranslocoService } from '@jsverse/transloco';
import { RealtimeEvent } from '@pd/contracts';
import { ToastService } from '../toast/toast.service';
import { desktopBridge } from './desktop-bridge';
import { RealtimeClient } from './realtime.client';

/**
 * Turns live events into what the user sees: a toast in the page, and in the desktop app
 * also a system notification when the window is hidden or not in focus.
 */
@Injectable({ providedIn: 'root' })
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
    const subscription = this.client.events$.subscribe((event) => this.show(event));
    this.destroyRef.onDestroy(() => subscription.unsubscribe());
    this.desktop?.onNavigate?.((route) => void this.router.navigateByUrl(route));
  }

  private show(event: RealtimeEvent): void {
    if (event.type === 'achievements') {
      const label = this.transloco.translate('core.toast.achievement');
      for (const achievement of event.achievements) {
        const rarity = this.transloco.translate(`core.toast.rarity.${achievement.rarity}`);
        this.toasts.show({
          icon: achievement.icon,
          label,
          title: achievement.title,
          text: `${achievement.description} · ${rarity} · +${achievement.xp} XP`,
          rarity: achievement.rarity,
          route: '/achievements',
        });
        this.notifyDesktop(`${label} ${achievement.icon}`, achievement.title, '/achievements');
      }
    } else if (event.type === 'notification') {
      this.toasts.show({ icon: '🔔', title: event.title, text: event.body });
      this.notifyDesktop(event.title, event.body);
    }
  }

  /** A system notification only when the user might miss the toast. */
  private notifyDesktop(title: string, body: string, route?: string): void {
    if (this.desktop?.notify && (document.hidden || !document.hasFocus())) {
      this.desktop.notify({ title, body, route });
    }
  }
}

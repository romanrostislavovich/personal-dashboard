import { inject, Injectable, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';
import { pushApi } from '@pd/client-core';
import { PUSH_CHANNEL } from '@pd/contracts';
import { AuthService } from '../auth/auth.service';
import { DASHBOARD_CLIENT } from '../client/dashboard-client';
import { installId, isMobileApp, phoneModel } from './mobile-app';

/** Switched off on this phone by its user (Settings → Notifications). */
const OFF_KEY = 'pd.mobile.pushOff';

/** Where the phone stands with push notifications, for Settings → Notifications. */
export type PhonePush = 'on' | 'off' | 'denied' | 'unavailable';

/**
 * Push notifications on this phone (the Android app): asks Android for the permission, takes
 * the token Firebase gives the app and tells the server, so notifications come here next to
 * Telegram. Nothing happens until the owner has set the server's Firebase key; an APK built
 * without Firebase just says no. A tap on a notification opens the app.
 */
@Injectable({ providedIn: 'root' })
export class MobilePushService {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly push = pushApi(inject(DASHBOARD_CLIENT).api);
  private listening = false;

  readonly state = signal<PhonePush>('unavailable');

  /** On start and every few hours: the token may have changed; a new one is told again. */
  async sync(): Promise<void> {
    if (!isMobileApp() || !this.auth.user()) {
      return;
    }
    if (localStorage.getItem(OFF_KEY)) {
      this.state.set('off');
      return;
    }
    const status = await this.push.status();
    if (!status.keySet) {
      this.state.set('unavailable');
      return;
    }
    let permission = await PushNotifications.checkPermissions();
    if (permission.receive === 'prompt' || permission.receive === 'prompt-with-rationale') {
      permission = await PushNotifications.requestPermissions();
    }
    if (permission.receive !== 'granted') {
      this.state.set('denied');
      return;
    }
    await this.listen();
    // Made once, then kept by Android: the server sends into it (Firebase's fallback channel
    // is silent on MIUI). The user can change its sound in Android's settings.
    await PushNotifications.createChannel({
      id: PUSH_CHANNEL,
      name: 'Personal Dashboard',
      importance: 4,
      visibility: 0,
    }).catch(() => undefined);
    // The token comes to the `registration` listener.
    await PushNotifications.register();
  }

  async enable(): Promise<void> {
    localStorage.removeItem(OFF_KEY);
    await this.sync();
  }

  async disable(): Promise<void> {
    localStorage.setItem(OFF_KEY, '1');
    this.state.set('off');
    await PushNotifications.unregister().catch(() => undefined);
    await this.push.remove(installId()).catch(() => undefined);
  }

  private async listen(): Promise<void> {
    if (this.listening) {
      return;
    }
    this.listening = true;
    await PushNotifications.addListener('registration', ({ value }) => {
      void this.push
        .register(installId(), {
          token: value,
          name: phoneModel(navigator.userAgent),
          // The APK draws the bell's notifications itself, with buttons in the shade
          // (NotificationShadePlugin): it takes data messages. An older one, plain ones.
          rich: Capacitor.isPluginAvailable('NotificationShade'),
        })
        .then(() => this.state.set('on'))
        .catch(() => undefined);
    });
    await PushNotifications.addListener('registrationError', ({ error }) => {
      console.error(`Push notifications: ${error}`);
      this.state.set('unavailable');
    });
    // A tap on a notification: the app comes up on the page it is about (the server tells).
    await PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
      const route = action.notification.data?.['route'];
      void this.router.navigateByUrl(
        typeof route === 'string' && route.startsWith('/') ? route : '/',
      );
    });
  }
}

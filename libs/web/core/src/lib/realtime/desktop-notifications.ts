/** Switched off on this computer by its user (Settings → Notifications). */
const OFF_KEY = 'pd.desktop.notificationsOff';

/** Whether the desktop app on this computer shows system notifications (on unless switched off). */
export function desktopNotificationsOn(): boolean {
  try {
    return localStorage.getItem(OFF_KEY) === null;
  } catch {
    return true;
  }
}

export function setDesktopNotifications(on: boolean): void {
  try {
    if (on) {
      localStorage.removeItem(OFF_KEY);
    } else {
      localStorage.setItem(OFF_KEY, '1');
    }
  } catch {
    // Without storage the setting lasts until the app restarts.
  }
}

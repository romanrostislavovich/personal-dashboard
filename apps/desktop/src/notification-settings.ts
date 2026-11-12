import {execFile} from 'node:child_process';
import {join} from 'node:path';

/**
 * Whether Windows shows notifications at all. With the switch "Notifications" in Settings →
 * System off, Electron's Notification.show() does nothing and says nothing: the test in the
 * dashboard's settings stayed silent (2026-11). The page then says why and opens that switch.
 */

const KEY =
  'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\PushNotifications';

/** `reg query` output: the switch is off only when `ToastEnabled` is there and 0. */
export function toastsOff(regOutput: string): boolean {
  return /ToastEnabled\s+REG_DWORD\s+0x0*0\b/i.test(regOutput);
}

/** True when Windows has its notifications switched off; false elsewhere or when unknown. */
export function systemNotificationsOff(): Promise<boolean> {
  if (process.platform !== 'win32') {
    return Promise.resolve(false);
  }
  const reg = join(
    process.env['SystemRoot'] ?? 'C:\\Windows',
    'System32',
    'reg.exe',
  );
  return new Promise(resolve =>
    execFile(
      reg,
      ['query', KEY, '/v', 'ToastEnabled'],
      {windowsHide: true, timeout: 5000},
      // No value at all (a fresh Windows): notifications are on.
      (error, stdout) => resolve(!error && toastsOff(stdout)),
    ),
  );
}

/** The page of Windows settings with that switch. */
export const NOTIFICATION_SETTINGS_URL = 'ms-settings:notifications';

import {describe, expect, it} from 'vitest';
import {toastsOff} from './notification-settings';

const query = (value: string) =>
  [
    '',
    'HKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\CurrentVersion\\PushNotifications',
    `    ToastEnabled    REG_DWORD    ${value}`,
    '',
  ].join('\r\n');

describe('toastsOff', () => {
  it('is true when Windows has its notifications switched off', () => {
    expect(toastsOff(query('0x0'))).toBe(true);
  });

  it('is false when they are on', () => {
    expect(toastsOff(query('0x1'))).toBe(false);
  });

  it('is false without the value', () => {
    expect(toastsOff('')).toBe(false);
  });
});

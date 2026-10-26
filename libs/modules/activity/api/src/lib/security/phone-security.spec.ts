import { PhoneSecurity } from '@pd/contracts';
import { phoneProblems } from './phone-security';
import { phoneSecurityMessages } from './phone-security.messages';

const now = new Date('2026-10-26T18:00:00Z');
const text = phoneSecurityMessages('ru');

/** Like the owner's Redmi 9: Android 10, an old patch, a PIN, Telegram may install APKs. */
const report = (changes: Partial<PhoneSecurity> = {}): PhoneSecurity => ({
  at: '2026-10-26T09:00:00Z',
  android: { release: '10', sdk: 29, securityPatch: '2021-09-01', model: 'M2004J19C' },
  screenLock: true,
  encrypted: true,
  rooted: false,
  developerOptions: true,
  usbDebugging: true,
  deviceAdmins: [],
  accessibility: [],
  installers: [{ package: 'org.telegram.messenger', name: 'Telegram' }],
  notFromPlay: [],
  userCertificates: [],
  wifi: { name: 'Home', open: false },
  vpn: false,
  ...changes,
});
const phone = (changes: Partial<PhoneSecurity> = {}) => ({
  id: 'p1',
  name: 'M2004J19C',
  report: report(changes),
});
const keys = (changes: Partial<PhoneSecurity> = {}) =>
  phoneProblems(phone(changes), text, now).map((problem) => `${problem.key} ${problem.severity}`);

describe('phoneProblems', () => {
  it('sees the old patch and the app that installs others, not USB debugging', () => {
    expect(keys()).toEqual(['p1.old-patch medium', 'p1.installers medium']);
    const [patch] = phoneProblems(phone(), text, now);
    expect(patch.title).toContain('2021-09-01');
  });

  it('tells a missing lock once (encryption goes with it)', () => {
    expect(keys({ screenLock: false, encrypted: false, installers: [] })).toEqual([
      'p1.old-patch medium',
      'p1.no-lock high',
    ]);
  });

  it('flags a device admin, a certificate added by hand, root and an open Wi-Fi', () => {
    expect(
      keys({
        android: { release: '14', sdk: 34, securityPatch: '2026-10-01', model: 'X' },
        installers: [],
        deviceAdmins: [{ package: 'com.spy.app', name: 'Spy' }],
        userCertificates: ['user:abc.0'],
        rooted: true,
        wifi: { name: 'Cafe', open: true },
      }),
    ).toEqual([
      'p1.rooted high',
      'p1.device-admins high',
      'p1.user-certificates high',
      'p1.open-wifi low',
    ]);
  });

  it('says nothing of a phone that never reported, and only that it is silent after a week', () => {
    expect(phoneProblems({ id: 'p1', name: 'X', report: null }, text, now)).toEqual([]);
    expect(keys({ at: '2026-10-10T09:00:00Z' })).toEqual(['p1.silent info']);
  });
});

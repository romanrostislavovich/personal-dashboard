import {FoundProblem} from '@pd/api-core';
import {PhoneSecurity} from '@pd/contracts';
import {PhoneSecurityMessages} from './phone-security.messages';

/** A phone with the Android app and its last security report (`null` — none yet). */
export interface PhoneFacts {
  id: string;
  name: string;
  report: PhoneSecurity | null;
}

/** The report comes daily: this long without one means the app no longer runs there. */
const SILENT_DAYS = 7;
/** Android patches come monthly: half a year behind is a phone left without updates. */
const PATCH_OLD_DAYS = 180;

/**
 * The rules of a phone: what in its report is a problem, and how bad. USB debugging and the
 * developer options are no finding (the owner's choice, 2026-10-26); the apps with accessibility
 * and the apps not from Google Play go to the AI as facts only.
 */
export function phoneProblems(
  phone: PhoneFacts,
  text: PhoneSecurityMessages,
  now: Date,
): FoundProblem[] {
  const {name, report} = phone;
  const key = (problem: string) => `${phone.id}.${problem}`;
  if (!report) {
    return []; // Registered and never told: nothing is known, nothing to claim.
  }
  const silentDays = Math.floor(
    (now.getTime() - Date.parse(report.at)) / 86_400_000,
  );
  if (silentDays >= SILENT_DAYS) {
    return [
      {key: key('silent'), severity: 'info', ...text.silent(name, silentDays)},
    ];
  }
  const problems: FoundProblem[] = [];
  const patch = Date.parse(report.android.securityPatch);
  if (
    !Number.isNaN(patch) &&
    now.getTime() - patch > PATCH_OLD_DAYS * 86_400_000
  ) {
    problems.push({
      key: key('old-patch'),
      severity: 'medium',
      ...text.oldPatch(
        name,
        report.android.securityPatch,
        report.android.release,
      ),
    });
  }
  if (!report.screenLock) {
    problems.push({
      key: key('no-lock'),
      severity: 'high',
      ...text.noLock(name),
    });
  } else if (report.encrypted === false) {
    // Without a lock the missing encryption is the same problem, told once.
    problems.push({
      key: key('not-encrypted'),
      severity: 'medium',
      ...text.notEncrypted(name),
    });
  }
  if (report.rooted) {
    problems.push({key: key('rooted'), severity: 'high', ...text.rooted(name)});
  }
  if (report.deviceAdmins.length) {
    problems.push({
      key: key('device-admins'),
      severity: 'high',
      ...text.deviceAdmins(
        name,
        report.deviceAdmins.map(app => app.name),
      ),
    });
  }
  if (report.userCertificates.length) {
    problems.push({
      key: key('user-certificates'),
      severity: 'high',
      ...text.userCertificates(name, report.userCertificates.length),
    });
  }
  if (report.installers.length) {
    problems.push({
      key: key('installers'),
      severity: 'medium',
      ...text.installers(
        name,
        report.installers.map(app => app.name),
      ),
    });
  }
  if (report.wifi?.open) {
    problems.push({
      key: key('open-wifi'),
      severity: 'low',
      ...text.openWifi(name, report.wifi.name),
    });
  }
  return problems;
}

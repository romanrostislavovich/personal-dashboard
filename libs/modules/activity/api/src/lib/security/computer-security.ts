import { FoundProblem } from '@pd/api-core';
import { ActivitySystem } from '@pd/contracts';
import { ComputerSecurityMessages } from './computer-security.messages';

/** A computer with the desktop app, as it last told about itself. */
export interface ComputerFacts {
  id: string;
  name: string;
  platform: string;
  /** When it last reported; `null` — never. */
  reportedAt: string | null;
  os: ActivitySystem['os'] | null;
  antivirus: ActivitySystem['defender'] | null;
  protection: ActivitySystem['protection'] | null;
}

/** A computer silent this long is switched off or gone: what it said last says little. */
const SILENT_DAYS = 14;
const SIGNATURES_OLD_DAYS = 7;
/** Windows fixes come monthly: this long without one means a month was missed. */
const UPDATES_OLD_DAYS = 45;

/** The rules of a computer: what in its report is a problem, and how bad. */
export function computerProblems(
  computer: ComputerFacts,
  text: ComputerSecurityMessages,
  now: Date,
): FoundProblem[] {
  const { name, antivirus, protection } = computer;
  const key = (problem: string) => `${computer.id}.${problem}`;
  if (!computer.reportedAt) {
    return []; // Registered and never heard from: nothing is known, nothing to claim.
  }
  const silentDays = Math.floor((now.getTime() - Date.parse(computer.reportedAt)) / 86_400_000);
  if (silentDays >= SILENT_DAYS) {
    return [{ key: key('silent'), severity: 'info', ...text.silent(name, silentDays) }];
  }

  const problems: FoundProblem[] = [];
  if (antivirus && (!antivirus.enabled || !antivirus.realtime)) {
    problems.push({ key: key('antivirus-off'), severity: 'high', ...text.antivirusOff(name) });
  } else if (antivirus && antivirus.signatureAgeDays >= SIGNATURES_OLD_DAYS) {
    problems.push({
      key: key('signatures-old'),
      severity: 'medium',
      ...text.signaturesOld(name, antivirus.signatureAgeDays),
    });
  }
  const off = (protection?.firewall ?? []).filter((item) => !item.enabled);
  if (off.length) {
    problems.push({
      key: key('firewall-off'),
      severity: 'high',
      ...text.firewallOff(
        name,
        off.map((item) => item.profile),
      ),
    });
  }
  if (protection?.diskEncrypted === false) {
    problems.push({ key: key('not-encrypted'), severity: 'low', ...text.notEncrypted(name) });
  }
  const sinceUpdate = protection?.daysSinceUpdate;
  if (sinceUpdate !== undefined && sinceUpdate >= UPDATES_OLD_DAYS) {
    problems.push({
      key: key('updates-old'),
      severity: 'medium',
      ...text.updatesOld(name, sinceUpdate),
    });
  }
  if (protection?.restartPending) {
    problems.push({ key: key('restart-pending'), severity: 'low', ...text.restartPending(name) });
  }
  if (protection?.locksWhenIdle === false) {
    problems.push({ key: key('no-idle-lock'), severity: 'info', ...text.noIdleLock(name) });
  }
  if (protection?.uac === false) {
    problems.push({ key: key('uac-off'), severity: 'medium', ...text.uacOff(name) });
  }
  return problems;
}

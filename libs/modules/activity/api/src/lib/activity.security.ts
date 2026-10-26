import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { DB, Database, Inspection, SecurityService } from '@pd/api-core';
import { desc, eq } from 'drizzle-orm';
import { activityDevices, activityHealth } from './activity.schema';
import { activityPhoneSecurity } from './phone/phone-security.schema';
import { ComputerFacts, computerProblems } from './security/computer-security';
import { computerSecurityMessages } from './security/computer-security.messages';
import { PhoneFacts, phoneProblems } from './security/phone-security';
import { phoneSecurityMessages } from './security/phone-security.messages';

/**
 * The devices of Activity for the security agent: the computers with the desktop app (what each
 * last told about its antivirus, firewall, disk encryption and updates — the shell's
 * system-info.ps1 collects it), and the phones with the Android app (their daily security report).
 */
/** Devices that are phones: they have their own source. */
const PHONES = new Set(['android', 'ios']);

@Injectable()
export class ActivitySecurity implements OnModuleInit {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly security: SecurityService,
  ) {}

  onModuleInit(): void {
    this.security.registerSource({
      id: 'computers',
      area: 'desktop',
      description:
        'The computers with the desktop app as each last reported: the system and its build, ' +
        'the antivirus (on, real-time protection, age of the definitions), the firewall by ' +
        'network profile, disk encryption, days since the last Windows update, a pending ' +
        'restart, the lock after idling, User Account Control.',
      inspect: (userId, locale) => this.inspect(userId, locale),
    });
    this.security.registerSource({
      id: 'phones',
      area: 'phone',
      description:
        'The phones with the Android app, each with its last daily security report: Android ' +
        'and the date of its security patch, the screen lock, encryption, root, developer ' +
        'options and USB debugging (the owner keeps them on knowingly), the apps that are ' +
        'device administrators, have an accessibility service on, may install other apps, or ' +
        'came from somewhere other than Google Play (with their installer), the certificate ' +
        'authorities added by hand, the Wi-Fi it is on (open or not) and whether a VPN runs.',
      inspect: (userId, locale) => this.inspectPhones(userId, locale),
    });
  }

  /** `null` — no phone is registered: there is nothing to look at. */
  private async inspectPhones(userId: string, locale: string): Promise<Inspection | null> {
    const phones = await this.db
      .select()
      .from(activityDevices)
      .where(eq(activityDevices.userId, userId));
    const own = phones.filter((device) => PHONES.has(device.platform));
    if (!own.length) {
      return null;
    }
    const facts: PhoneFacts[] = [];
    for (const device of own) {
      const [last] = await this.db
        .select({ report: activityPhoneSecurity.report })
        .from(activityPhoneSecurity)
        .where(eq(activityPhoneSecurity.deviceId, device.id));
      facts.push({ id: device.id, name: device.name, report: last?.report ?? null });
    }
    const text = phoneSecurityMessages(locale);
    const now = new Date();
    return {
      facts,
      problems: facts.flatMap((phone) => phoneProblems(phone, text, now)),
    };
  }

  /** `null` — no computer is registered: there is nothing to look at. */
  private async inspect(userId: string, locale: string): Promise<Inspection | null> {
    const devices = await this.db
      .select()
      .from(activityDevices)
      .where(eq(activityDevices.userId, userId));
    const desktops = devices.filter((device) => !PHONES.has(device.platform));
    if (!desktops.length) {
      return null;
    }
    const computers: ComputerFacts[] = [];
    for (const device of desktops) {
      const [last] = await this.db
        .select({ at: activityHealth.at, system: activityHealth.system })
        .from(activityHealth)
        .where(eq(activityHealth.deviceId, device.id))
        .orderBy(desc(activityHealth.at))
        .limit(1);
      computers.push({
        id: device.id,
        name: device.name,
        platform: device.platform,
        reportedAt: last?.at.toISOString() ?? null,
        os: last?.system?.os ?? null,
        antivirus: last?.system?.defender ?? null,
        protection: last?.system?.protection ?? null,
      });
    }
    const text = computerSecurityMessages(locale);
    const now = new Date();
    return {
      facts: computers,
      problems: computers.flatMap((computer) => computerProblems(computer, text, now)),
    };
  }
}

import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { DB, Database, Inspection, SecurityService } from '@pd/api-core';
import { desc, eq } from 'drizzle-orm';
import { activityDevices, activityHealth } from './activity.schema';
import { ComputerFacts, computerProblems } from './security/computer-security';
import { computerSecurityMessages } from './security/computer-security.messages';

/**
 * The computers with the desktop app, for the security agent: what each one last told about its
 * antivirus, firewall, disk encryption and updates (the shell's system-info.ps1 collects it).
 */
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
  }

  /** `null` — no computer is registered: there is nothing to look at. */
  private async inspect(userId: string, locale: string): Promise<Inspection | null> {
    const devices = await this.db
      .select()
      .from(activityDevices)
      .where(eq(activityDevices.userId, userId));
    if (!devices.length) {
      return null;
    }
    const computers: ComputerFacts[] = [];
    for (const device of devices) {
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

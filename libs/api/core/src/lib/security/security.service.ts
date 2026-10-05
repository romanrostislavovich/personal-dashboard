import { ForbiddenException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  FindingOrigin,
  FindingStatus,
  SECURITY_AREAS,
  SECURITY_SEVERITIES,
  SecurityArea,
  SecurityFinding,
  SecurityReport,
  SecuritySettings,
  SecurityStatus,
} from '@pd/contracts';
import { and, desc, eq, like } from 'drizzle-orm';
import { AiConnectionsService } from '../ai/ai-connections.service';
import { DB, Database } from '../database/database.module';
import { NotificationsService } from '../notifications/notifications.service';
import { UsersService } from '../users/users.service';
import { FoundProblem, Inspection, SecuritySource } from './security-source';
import { securityMessages } from './security.messages';
import {
  SecurityFindingRow,
  securityFindings,
  securityReports,
  securitySettings,
} from './security.schema';

/** A new finding this bad is told at once; the rest wait in the Security section. */
const NOTIFIED = new Set(['critical', 'high']);
const REPORTS_KEPT = 30;
/** Findings of the AI are keyed apart from the sources' own. */
export const AI_SOURCE = 'ai';

/** A problem with the area it belongs to: what a source's inspection or the AI gives. */
export type AreaProblem = FoundProblem & { area: SecurityArea };

/**
 * The security agent's memory: what was found, what the user chose to ignore, the settings.
 * The sources (security-source.ts) are asked by `scan`; a finding seen again is the same row,
 * one that is gone is marked resolved. The agent belongs to the owner of the instance — the
 * server and the site are theirs — so only the owner sees or runs it.
 */
@Injectable()
export class SecurityService {
  private readonly logger = new Logger(SecurityService.name);
  private readonly registered: SecuritySource[] = [];

  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly users: UsersService,
    private readonly notifications: NotificationsService,
    private readonly connections: AiConnectionsService,
  ) {}

  /** Called by the core and by modules (`<module>.security.ts`) on start. */
  registerSource(source: SecuritySource): void {
    if (this.registered.some((item) => item.id === source.id)) {
      throw new Error(`Security source ${source.id} is registered twice`);
    }
    this.registered.push(source);
  }

  get sources(): readonly SecuritySource[] {
    return this.registered;
  }

  async assertOwner(userId: string): Promise<void> {
    if ((await this.users.owner())?.id !== userId) {
      throw new ForbiddenException('The security agent reports to the owner of the instance');
    }
  }

  /** What a source knows now; `null` — nothing to look at, or it failed (logged). */
  async inspect(source: SecuritySource, userId: string): Promise<Inspection | null> {
    const locale = (await this.users.findById(userId))?.locale ?? 'en';
    try {
      return await source.inspect(userId, locale);
    } catch (error) {
      this.logger.warn(`Security source ${source.id} failed: ${String(error)}`);
      return null;
    }
  }

  /** Asks every source and brings the findings of the rules up to date. */
  async scan(userId: string): Promise<void> {
    const areas = new Set<SecurityArea>();
    const fresh: SecurityFindingRow[] = [];
    for (const source of this.registered) {
      const inspection = await this.inspect(source, userId);
      if (!inspection) {
        continue; // Its earlier findings stay as they are: nothing is known about them now.
      }
      areas.add(source.area);
      const problems = inspection.problems.map((problem) => ({ ...problem, area: source.area }));
      fresh.push(...(await this.keep(userId, source.id, 'rules', problems)));
    }
    await this.db
      .insert(securitySettings)
      .values({ userId, scannedAt: new Date(), areas: [...areas] })
      .onConflictDoUpdate({
        target: securitySettings.userId,
        set: { scannedAt: new Date(), areas: [...areas] },
      });
    await this.tell(userId, fresh);
  }

  /**
   * Makes the stored findings of one source match what it sees now: new ones are added, known
   * ones refreshed, the ones not seen any more resolved. Returns what is new (or back).
   */
  async keep(
    userId: string,
    sourceId: string,
    origin: FindingOrigin,
    problems: AreaProblem[],
  ): Promise<SecurityFindingRow[]> {
    const prefix = `${sourceId}:`;
    const known = await this.db
      .select()
      .from(securityFindings)
      .where(and(eq(securityFindings.userId, userId), like(securityFindings.key, `${prefix}%`)));
    const now = new Date();
    const fresh: SecurityFindingRow[] = [];
    const seen = new Set<string>();

    for (const { key: ownKey, area, severity, title, details, fix } of problems) {
      const key = prefix + ownKey;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      const text = { area, severity, title, details, fix, lastSeenAt: now };
      const row = known.find((item) => item.key === key);
      if (!row) {
        const [created] = await this.db
          .insert(securityFindings)
          .values({ userId, key, origin, ...text })
          .returning();
        fresh.push(created);
      } else {
        const back = row.status === 'resolved';
        // A problem that came back may differ from the one the guide was written for.
        const reopened = { status: 'open' as const, resolvedAt: null, guide: null, guideAt: null };
        const [updated] = await this.db
          .update(securityFindings)
          .set({ ...text, ...(back ? reopened : {}) })
          .where(eq(securityFindings.id, row.id))
          .returning();
        if (back) {
          fresh.push(updated);
        }
      }
    }
    for (const row of known.filter((item) => item.status !== 'resolved' && !seen.has(item.key))) {
      await this.db
        .update(securityFindings)
        .set({ status: 'resolved', resolvedAt: now })
        .where(eq(securityFindings.id, row.id));
    }
    return fresh;
  }

  /** One message about what is new and serious. */
  async tell(userId: string, fresh: SecurityFindingRow[]): Promise<void> {
    const serious = fresh.filter((row) => NOTIFIED.has(row.severity));
    if (!serious.length) {
      return;
    }
    const text = securityMessages((await this.users.findById(userId))?.locale ?? 'en');
    await this.notifications.send(userId, {
      title: text.notifyTitle(serious.length),
      body: [
        ...serious.map((row) => text.notifyLine(row.severity, row.title)),
        text.notifyMore,
      ].join('\n'),
      source: 'security',
    });
  }

  async status(userId: string): Promise<SecurityStatus> {
    const rows = await this.db
      .select()
      .from(securityFindings)
      .where(eq(securityFindings.userId, userId));
    const [settings] = await this.db
      .select()
      .from(securitySettings)
      .where(eq(securitySettings.userId, userId));
    const ai = await this.connections.settings(userId);
    return {
      findings: rows.map(toFinding).sort(bySeverity),
      areas: SECURITY_AREAS.map((area) => ({
        area,
        available: settings?.areas.includes(area) ?? false,
      })),
      report: await this.latestReport(userId),
      settings: toSettings(settings),
      scannedAt: settings?.scannedAt?.toISOString() ?? null,
      aiAvailable: ai.configured,
      connections: ai.connections.map(({ id, name }) => ({ id, name })),
    };
  }

  async settings(userId: string): Promise<SecuritySettings> {
    const [row] = await this.db
      .select()
      .from(securitySettings)
      .where(eq(securitySettings.userId, userId));
    return toSettings(row);
  }

  async saveSettings(userId: string, input: SecuritySettings): Promise<void> {
    await this.db
      .insert(securitySettings)
      .values({ userId, ...input })
      .onConflictDoUpdate({ target: securitySettings.userId, set: input });
  }

  /** "I know, leave it": an ignored finding is not reported again — or back to open. */
  async setStatus(userId: string, id: string, status: Extract<FindingStatus, 'open' | 'ignored'>) {
    const [row] = await this.db
      .update(securityFindings)
      .set({ status })
      .where(and(eq(securityFindings.id, id), eq(securityFindings.userId, userId)))
      .returning();
    if (!row) {
      throw new NotFoundException();
    }
  }

  async finding(userId: string, id: string): Promise<SecurityFindingRow> {
    const [row] = await this.db
      .select()
      .from(securityFindings)
      .where(and(eq(securityFindings.id, id), eq(securityFindings.userId, userId)));
    if (!row) {
      throw new NotFoundException();
    }
    return row;
  }

  async saveGuide(id: string, guide: string): Promise<void> {
    await this.db
      .update(securityFindings)
      .set({ guide, guideAt: new Date() })
      .where(eq(securityFindings.id, id));
  }

  async saveReport(userId: string, text: string, model: string): Promise<SecurityReport> {
    const [row] = await this.db.insert(securityReports).values({ userId, text, model }).returning();
    const old = await this.db
      .select({ id: securityReports.id })
      .from(securityReports)
      .where(eq(securityReports.userId, userId))
      .orderBy(desc(securityReports.createdAt))
      .offset(REPORTS_KEPT);
    for (const { id } of old) {
      await this.db.delete(securityReports).where(eq(securityReports.id, id));
    }
    return { text: row.text, model: row.model, createdAt: row.createdAt.toISOString() };
  }

  private async latestReport(userId: string): Promise<SecurityReport | null> {
    const [row] = await this.db
      .select()
      .from(securityReports)
      .where(eq(securityReports.userId, userId))
      .orderBy(desc(securityReports.createdAt))
      .limit(1);
    return row
      ? { text: row.text, model: row.model, createdAt: row.createdAt.toISOString() }
      : null;
  }
}

function toSettings(
  row: { aiEnabled: boolean; connectionId: string | null } | undefined,
): SecuritySettings {
  return { aiEnabled: row?.aiEnabled ?? true, connectionId: row?.connectionId ?? null };
}

export function toFinding(row: SecurityFindingRow): SecurityFinding {
  return {
    id: row.id,
    area: row.area,
    severity: row.severity,
    title: row.title,
    details: row.details,
    fix: row.fix,
    guide: row.guide,
    guideAt: row.guideAt?.toISOString() ?? null,
    origin: row.origin,
    status: row.status,
    firstSeenAt: row.firstSeenAt.toISOString(),
    lastSeenAt: row.lastSeenAt.toISOString(),
    resolvedAt: row.resolvedAt?.toISOString() ?? null,
  };
}

/** The worst first; among equals the newest. */
function bySeverity(a: SecurityFinding, b: SecurityFinding): number {
  return (
    SECURITY_SEVERITIES.indexOf(a.severity) - SECURITY_SEVERITIES.indexOf(b.severity) ||
    b.firstSeenAt.localeCompare(a.firstSeenAt)
  );
}

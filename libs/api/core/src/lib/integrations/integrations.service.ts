import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { IntegrationState, IntegrationStatus } from '@pd/contracts';
import { and, eq, inArray } from 'drizzle-orm';
import { DB, Database } from '../database/database.module';
import { DemoService } from '../demo/demo.service';
import { coreMessages } from '../i18n/core.messages';
import { NotificationsService } from '../notifications/notifications.service';
import { SchedulerService } from '../scheduler/scheduler.service';
import { UsersService } from '../users/users.service';
import { DEFAULT_STALE_HOURS, IntegrationReport, newTroubles, stateOf } from './integration-state';
import { integrationAlerts } from './integrations.schema';

/**
 * How a section's connections to outside services are doing (`<module>.integrations.ts`):
 *
 * ```ts
 * integrations.register({
 *   id: 'music.lastfm',
 *   module: 'music',
 *   staleHours: 6,
 *   reports: async (userId) => [{ name: 'Last.fm', detail: username, lastSyncedAt, error }],
 * });
 * ```
 *
 * `reports` returns nothing for a service that is not connected.
 */
export interface IntegrationSource {
  id: string;
  module: string;
  /** How long without a refresh is too long for it (DEFAULT_STALE_HOURS when left out). */
  staleHours?: number;
  reports(userId: string): Promise<IntegrationReport[]>;
}

/**
 * One list of every connection to an outside service with its state — the last refresh, an
 * error, a token about to expire — and a message when one of them gets into trouble, before
 * the user notices the data has stopped coming.
 */
@Injectable()
export class IntegrationsService implements OnModuleInit {
  private readonly logger = new Logger(IntegrationsService.name);
  private readonly sources: IntegrationSource[] = [];

  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly users: UsersService,
    private readonly notifications: NotificationsService,
    private readonly scheduler: SchedulerService,
    private readonly demo: DemoService,
  ) {}

  register(source: IntegrationSource): void {
    this.sources.push(source);
  }

  onModuleInit(): void {
    this.scheduler.register({
      name: 'integrations.watch',
      cron: '20 9 * * *',
      handler: () => this.watch(),
    });
  }

  /** Every connection of the user, the troubled first. A source that fails is left out. */
  async statuses(userId: string): Promise<IntegrationStatus[]> {
    const now = new Date();
    // The connections of a demo are made up: nothing refreshes them, so none is ever late.
    const neverStale = this.demo.isDemoUser(userId);
    const statuses: IntegrationStatus[] = [];
    for (const source of this.sources) {
      try {
        for (const report of await source.reports(userId)) {
          statuses.push({
            id: report.key ? `${source.id}.${report.key}` : source.id,
            module: source.module,
            name: report.name,
            detail: report.detail ?? null,
            state: stateOf(
              report,
              neverStale ? Number.POSITIVE_INFINITY : (source.staleHours ?? DEFAULT_STALE_HOURS),
              now,
            ),
            lastSyncedAt: report.lastSyncedAt?.toISOString() ?? null,
            error: report.error ?? null,
            expiresAt: report.expiresAt?.toISOString() ?? null,
          });
        }
      } catch (error) {
        this.logger.warn(`Status of ${source.id} was not read: ${String(error).slice(0, 200)}`);
      }
    }
    return statuses.sort(
      (a, b) => Number(a.state === 'ok') - Number(b.state === 'ok') || a.name.localeCompare(b.name),
    );
  }

  /** Daily: tells every user about the connections whose trouble is new. */
  async watch(): Promise<void> {
    for (const user of await this.users.findAll()) {
      try {
        await this.tell(user.id, user.locale);
      } catch (error) {
        this.logger.warn(`Integrations of ${user.email} were not checked: ${String(error)}`);
      }
    }
  }

  private async tell(userId: string, locale: string): Promise<void> {
    const statuses = await this.statuses(userId);
    const rows = await this.db
      .select()
      .from(integrationAlerts)
      .where(eq(integrationAlerts.userId, userId));
    const told = new Map<string, IntegrationState>(
      rows.map((row) => [row.integrationId, row.state]),
    );
    const { tell, forget } = newTroubles(statuses, told);
    if (forget.length) {
      await this.db
        .delete(integrationAlerts)
        .where(
          and(
            eq(integrationAlerts.userId, userId),
            inArray(integrationAlerts.integrationId, forget),
          ),
        );
    }
    const troubled = statuses.filter((status) => tell.includes(status.id));
    if (!troubled.length) {
      return;
    }
    const text = coreMessages(locale);
    await this.notifications.send(userId, {
      title: text.integrationsTitle,
      body: [
        ...troubled.map((status) => text.integrationTrouble(status)),
        text.integrationsSee,
      ].join('\n'),
      source: 'integrations',
    });
    for (const { id, state } of troubled) {
      await this.db
        .insert(integrationAlerts)
        .values({ userId, integrationId: id, state })
        .onConflictDoUpdate({
          target: [integrationAlerts.userId, integrationAlerts.integrationId],
          set: { state, toldAt: new Date() },
        });
    }
  }
}

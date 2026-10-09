import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { aiConnections, aiSettings } from '../ai/ai.schema';
import { AiService } from '../ai/ai.service';
import { NO_PARAMETERS } from '../ai/ai-tool';
import { DB, Database } from '../database/database.module';
import { LinksService } from '../links/links.service';
import { users } from '../users/users.schema';
import { IntegrationsService } from './integrations.service';

/**
 * The core's own connections in the list of integrations — Telegram and the AI — and the
 * assistant's access to the whole list.
 */
@Injectable()
export class CoreIntegrations implements OnModuleInit {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly integrations: IntegrationsService,
    private readonly ai: AiService,
    private readonly links: LinksService,
  ) {}

  onModuleInit(): void {
    this.integrations.register({
      id: 'core.telegram',
      module: 'core',
      reports: async (userId) => {
        const [user] = await this.db
          .select({ chatId: users.telegramChatId })
          .from(users)
          .where(eq(users.id, userId));
        // A bot does not refresh: it is connected or it is not.
        return user?.chatId ? [{ name: 'Telegram' }] : [];
      },
    });

    this.integrations.register({
      id: 'core.ai',
      module: 'ai',
      reports: async (userId) => {
        const connections = await this.db
          .select()
          .from(aiConnections)
          .where(eq(aiConnections.userId, userId));
        const [settings] = await this.db
          .select({ active: aiSettings.activeConnectionId })
          .from(aiSettings)
          .where(eq(aiSettings.userId, userId));
        const active =
          connections.find((connection) => connection.id === settings?.active) ?? connections[0];
        return active ? [{ name: 'AI', detail: `${active.name} · ${active.model}` }] : [];
      },
    });

    this.ai.registerTool({
      name: 'core_integrations',
      module: 'core',
      description:
        'The connections to outside services (GitHub, GitLab, Bitbucket, WakaTime, Last.fm, ' +
        'Spotify, SoundCloud, Steam, Dota, WoW, cost sources, Telegram, the AI itself) with ' +
        'their state: ok; error — the last refresh failed, with the text; stale — no refresh ' +
        'for too long; expiring / expired — its token, with the date. `lastSyncedAt` — the ' +
        'last successful refresh. Useful for "why is my music not updating", "is everything ' +
        'connected", "which tokens expire soon". Tokens are renewed in Settings → Integrations.',
      parameters: NO_PARAMETERS,
      handler: (userId) => this.integrations.statuses(userId),
    });
    this.links.registerPages([
      {
        module: 'core',
        path: '/settings?tab=integrations',
        description: 'connections to outside services and their state',
      },
    ]);
  }
}

import {Inject, Injectable, OnModuleInit} from '@nestjs/common';
import {eq} from 'drizzle-orm';
import {aiConnections, aiSettings} from '../ai/ai.schema';
import {AiService} from '../ai/ai.service';
import {NO_PARAMETERS} from '../ai/ai-tool';
import {DB, Database} from '../database/database.module';
import {LinksService} from '../links/links.service';
import {pushDevices} from '../notifications/push/push.schema';
import {PUSH_KEY} from '../notifications/push/push.service';
import {ServerKeysService} from '../server-keys/server-keys.service';
import {users} from '../users/users.schema';
import {IntegrationsService} from './integrations.service';

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
    private readonly keys: ServerKeysService,
  ) {}

  onModuleInit(): void {
    this.integrations.register({
      id: 'core.telegram',
      module: 'core',
      name: 'Telegram',
      settingsTab: 'notifications',
      reports: async userId => {
        const [user] = await this.db
          .select({chatId: users.telegramChatId})
          .from(users)
          .where(eq(users.id, userId));
        // A bot does not refresh: it is connected or it is not.
        return user?.chatId ? [{name: 'Telegram'}] : [];
      },
    });

    this.integrations.register({
      id: 'core.push',
      module: 'core',
      name: 'Firebase',
      settingsTab: 'notifications',
      // The server's Firebase key, then each phone of the Android app that takes notifications.
      reports: async userId => {
        if ((await this.keys.get(PUSH_KEY)) === null) {
          return [];
        }
        const phones = await this.db
          .select({name: pushDevices.name})
          .from(pushDevices)
          .where(eq(pushDevices.userId, userId));
        return [
          {
            name: 'Firebase',
            detail: phones.length ? null : 'no phone takes push yet',
          },
          ...phones.map((phone, i) => ({
            key: String(i),
            name: 'Push',
            detail: phone.name,
          })),
        ];
      },
    });

    this.integrations.register({
      id: 'core.ai',
      module: 'ai',
      name: 'AI',
      reports: async userId => {
        const connections = await this.db
          .select()
          .from(aiConnections)
          .where(eq(aiConnections.userId, userId));
        const [settings] = await this.db
          .select({active: aiSettings.activeConnectionId})
          .from(aiSettings)
          .where(eq(aiSettings.userId, userId));
        const active =
          connections.find(connection => connection.id === settings?.active) ??
          connections[0];
        return active
          ? [{name: 'AI', detail: `${active.name} · ${active.model}`}]
          : [];
      },
    });

    this.ai.registerTool({
      name: 'core_integrations',
      module: 'core',
      description:
        'The connections to outside services (GitHub, GitLab, Bitbucket, WakaTime, Last.fm, ' +
        'Spotify, SoundCloud, Steam, Dota, WoW, cost sources, Telegram, the AI itself) with ' +
        'their state: ok; error — the last refresh failed, with the text; stale — no refresh ' +
        'for too long; expiring / expired — its token, with the date; off — the dashboard can ' +
        'connect it, but it is not connected. `lastSyncedAt` — the ' +
        'last successful refresh. Useful for "why is my music not updating", "is everything ' +
        'connected", "which tokens expire soon". Tokens are renewed in Settings → Integrations.',
      parameters: NO_PARAMETERS,
      handler: userId => this.integrations.statuses(userId),
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

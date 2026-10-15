import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { AchievementsService, achievementTiers, DB, Database } from '@pd/api-core';
import { count, eq } from 'drizzle-orm';
import { vaultItems } from './vault.schema';

/**
 * Password vault achievements: how many items it keeps — the one thing the server can see. How
 * strong the passwords are, or whether one is used twice, is known only on the device; telling
 * the server would weaken the very encryption the vault is for, so it is not measured.
 */
@Injectable()
export class VaultAchievements implements OnModuleInit {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly achievements: AchievementsService,
  ) {}

  onModuleInit(): void {
    this.achievements.register({
      id: 'vault.items',
      module: 'vault',
      measure: async (userId) => {
        const [row] = await this.db
          .select({ value: count() })
          .from(vaultItems)
          .where(eq(vaultItems.userId, userId));
        return row?.value ?? 0;
      },
      tiers: achievementTiers(
        [
          10,
          '🔑',
          { en: 'A key ring', ru: 'Связка ключей' },
          { en: '10 items in the password vault', ru: '10 записей в хранилище паролей' },
        ],
        [
          50,
          '🗝️',
          { en: 'Keeper of keys', ru: 'Ключник' },
          { en: '50 items in the password vault', ru: '50 записей в хранилище паролей' },
        ],
        [
          100,
          '🏰',
          { en: 'Fortress', ru: 'Крепость' },
          { en: '100 items in the password vault', ru: '100 записей в хранилище паролей' },
        ],
      ),
    });
  }
}

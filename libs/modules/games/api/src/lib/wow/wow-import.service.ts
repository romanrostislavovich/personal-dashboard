import {Inject, Injectable, Logger} from '@nestjs/common';
import {DB, Database} from '@pd/api-core';
import {WowAccountCharacter, WowFoundCharacter} from '@pd/contracts';
import {and, eq, inArray} from 'drizzle-orm';
import {GameAccountsService} from '../game-accounts.service';
import {
  gameAccounts,
  GameAccountRow,
  wowDismissedCharacters,
} from '../games.schema';
import {
  foundExternalId,
  foundStatuses,
  ImportRow,
  planImport,
  wowCharacterKey,
} from './wow-import';

/**
 * Puts the characters of the Battle.net account on the Games page (see `planImport` for the
 * rules) and refreshes the new ones in the background, so the sign-in does not wait for them.
 */
@Injectable()
export class WowImportService {
  private readonly logger = new Logger(WowImportService.name);

  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly accounts: GameAccountsService,
  ) {}

  async import(
    userId: string,
    found: WowAccountCharacter[],
    answered: ReadonlySet<string>,
  ): Promise<void> {
    const plan = planImport(
      found,
      await this.rows(userId),
      await this.dismissed(userId),
      answered,
    );
    for (const {rowId, blizzardKey, externalId} of plan.link) {
      // A renamed character whose new address another row already has keeps its old one.
      await this.db
        .update(gameAccounts)
        .set({blizzardKey, externalId})
        .where(and(eq(gameAccounts.id, rowId), eq(gameAccounts.userId, userId)))
        .catch(() =>
          this.db
            .update(gameAccounts)
            .set({blizzardKey})
            .where(eq(gameAccounts.id, rowId)),
        );
    }
    await this.markOnAccount(userId, plan.gone, new Date());
    await this.markOnAccount(userId, plan.back, null);
    const added = await this.insert(
      userId,
      plan.add.map(({character, externalId}) => ({character, externalId})),
    );
    this.logger.log(
      `Battle.net import: ${added.length} added, ${plan.link.length} linked, ` +
        `${plan.gone.length} no longer on the account, ${plan.back.length} back`,
    );
    void this.accounts
      .syncFound(added)
      .catch(error =>
        this.logger.warn(`Sync of found characters failed: ${error}`),
      );
  }

  /** "Add" in the card: a character below level 10, or one removed before. */
  async addOne(userId: string, character: WowAccountCharacter): Promise<void> {
    const key = wowCharacterKey(character);
    const externalId = foundExternalId(character);
    await this.db
      .delete(wowDismissedCharacters)
      .where(
        and(
          eq(wowDismissedCharacters.userId, userId),
          eq(wowDismissedCharacters.blizzardKey, key),
        ),
      );
    if (!externalId) {
      return;
    }
    await this.accounts.syncFound(
      await this.insert(userId, [{character, externalId}]),
    );
  }

  async statuses(
    userId: string,
    found: WowAccountCharacter[],
  ): Promise<WowFoundCharacter[]> {
    return foundStatuses(
      found,
      await this.rows(userId),
      await this.dismissed(userId),
    );
  }

  private async insert(
    userId: string,
    items: {character: WowAccountCharacter; externalId: string}[],
  ): Promise<GameAccountRow[]> {
    if (items.length === 0) {
      return [];
    }
    return this.db
      .insert(gameAccounts)
      .values(
        items.map(({character, externalId}) => ({
          userId,
          game: 'wow' as const,
          externalId,
          blizzardKey: wowCharacterKey(character),
          // Until the first refresh; then it is the name as the game shows it.
          displayName: [character.name, character.surname ?? character.realm]
            .filter(Boolean)
            .join(' '),
        })),
      )
      .onConflictDoNothing()
      .returning();
  }

  private async markOnAccount(
    userId: string,
    ids: string[],
    since: Date | null,
  ): Promise<void> {
    if (ids.length > 0) {
      await this.db
        .update(gameAccounts)
        .set({notOnAccountSince: since})
        .where(
          and(eq(gameAccounts.userId, userId), inArray(gameAccounts.id, ids)),
        );
    }
  }

  private rows(userId: string): Promise<ImportRow[]> {
    return this.db
      .select({
        id: gameAccounts.id,
        externalId: gameAccounts.externalId,
        blizzardKey: gameAccounts.blizzardKey,
        notOnAccountSince: gameAccounts.notOnAccountSince,
      })
      .from(gameAccounts)
      .where(
        and(eq(gameAccounts.userId, userId), eq(gameAccounts.game, 'wow')),
      );
  }

  private async dismissed(userId: string): Promise<Set<string>> {
    const rows = await this.db
      .select({key: wowDismissedCharacters.blizzardKey})
      .from(wowDismissedCharacters)
      .where(eq(wowDismissedCharacters.userId, userId));
    return new Set(rows.map(row => row.key));
  }
}

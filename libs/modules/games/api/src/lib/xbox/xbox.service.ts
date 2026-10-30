import {BadRequestException, Injectable} from '@nestjs/common';
import {SecretsService, UsersService} from '@pd/api-core';
import {XboxGame, XboxSummary} from '@pd/contracts';
import {GameAccountRow} from '../games.schema';
import {OpenXblClient, OpenXblKeyError, XboxProfile} from './openxbl.client';

const KEY_SECRET = 'games.openxbl-key';

/** What is kept of an Xbox account between syncs (`games_accounts.profile`). */
export interface XboxStored extends XboxProfile {
  games: XboxGame[];
  /** No games came: what each way of asking answered (shapes only), shown on the page. */
  noGames?: string[];
}

/**
 * Xbox through OpenXBL: the user's key reads the Xbox account it was made with — its profile,
 * gamerscore and the title history with achievements. Xbox tells no minutes played this way.
 */
@Injectable()
export class XboxService {
  constructor(
    private readonly secrets: SecretsService,
    private readonly users: UsersService,
  ) {}

  hasKey(userId: string): Promise<boolean> {
    return this.secrets.has(userId, KEY_SECRET);
  }

  async saveKey(userId: string, apiKey: string): Promise<void> {
    try {
      await new OpenXblClient(apiKey).profile();
    } catch (error) {
      if (error instanceof OpenXblKeyError) {
        throw new BadRequestException('OpenXBL key is invalid');
      }
      // Anything else (OpenXBL down, an answer of another shape) is told as it is, not as a 500.
      throw new BadRequestException(
        `OpenXBL did not answer as expected: ${error instanceof Error ? error.message : error}`,
      );
    }
    await this.secrets.set(userId, KEY_SECRET, apiKey);
  }

  removeKey(userId: string): Promise<void> {
    return this.secrets.delete(userId, KEY_SECRET);
  }

  /** The account of the key: its Xbox user id and gamertag, before the first sync. */
  async identify(
    userId: string,
  ): Promise<{externalId: string; displayName: string}> {
    const profile = await (await this.client(userId)).profile();
    return {externalId: profile.xuid, displayName: profile.gamertag};
  }

  async sync(account: GameAccountRow): Promise<XboxStored> {
    const client = await this.client(account.userId);
    const profile = await client.profile();
    if (profile.xuid !== account.externalId) {
      // A key of another Xbox account was saved since: this account cannot be read with it.
      throw new Error('The OpenXBL key is of another Xbox account');
    }
    const {games, shapes} = await client.games(profile.xuid);
    return {...profile, games, ...(shapes.length ? {noGames: shapes} : {})};
  }

  summary(account: GameAccountRow): XboxSummary | null {
    const stored = account.profile as XboxStored | null;
    if (!stored) {
      return null;
    }
    return {
      game: 'xbox',
      gamertag: stored.gamertag,
      avatarUrl: stored.avatarUrl,
      gamerscore: stored.gamerscore,
      tier: stored.tier,
      profileUrl: `https://www.xbox.com/play/user/${encodeURIComponent(stored.gamertag)}`,
      totals: {
        games: stored.games.length,
        achievements: stored.games.reduce(
          (sum, game) => sum + (game.achievements?.unlocked ?? 0),
          0,
        ),
      },
      games: stored.games,
      noGames: stored.noGames ?? null,
    };
  }

  private async client(userId: string): Promise<OpenXblClient> {
    const key = await this.secrets.get(userId, KEY_SECRET);
    if (!key) {
      throw new BadRequestException(
        'No OpenXBL key: set it in Settings → Integrations',
      );
    }
    return new OpenXblClient(
      key,
      (await this.users.findById(userId))?.locale ?? 'en',
    );
  }
}

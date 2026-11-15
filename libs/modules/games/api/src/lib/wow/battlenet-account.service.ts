import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {ConfigService} from '@nestjs/config';
import {AppConfig, SecretsService} from '@pd/api-core';
import {
  BattlenetAccountState,
  WOW_REGIONS,
  WOW_VERSIONS,
  WowAccountCharacter,
} from '@pd/contracts';
import {randomBytes} from 'node:crypto';
import {
  AccountProfileAnswer,
  authorizeUrl,
  BattlenetUserToken,
  exchangeCode,
  fetchAccountProfile,
  parseAccountProfile,
} from './battlenet-account.client';
import {wowCharacterKey} from './wow-import';
import {WowImportService} from './wow-import.service';
import {WowService} from './wow.service';

const TOKEN_SECRET = 'games.wow.account-token';
const CHARACTERS_SECRET = 'games.wow.account-characters';
const STATE_TTL_MS = 10 * 60 * 1000;

interface StoredCharacters {
  discoveredAt: string;
  characters: WowAccountCharacter[];
}

/**
 * The Battle.net account: sign in once, and the characters of every region and version — WoW
 * Forever's too — are found by themselves.
 *
 * 1. `connectUrl()` — Blizzard's sign-in page (with a one-time `state`, kept in memory).
 * 2. Blizzard sends the browser back to `/api/games/battlenet/callback?code&state`.
 * 3. `handleCallback()` takes the token (about a day, no refresh) and looks for the characters;
 *    they are put on the Games page by WowImportService and read with the app's keys after that.
 *
 * Both the token and the list are secrets of the user: encrypted, and synced like the others.
 */
@Injectable()
export class BattlenetAccountService {
  private readonly logger = new Logger(BattlenetAccountService.name);
  private readonly publicUrl: string;
  private readonly pendingStates = new Map<
    string,
    {userId: string; expiresAt: number}
  >();

  constructor(
    @Inject(ConfigService) config: AppConfig,
    private readonly secrets: SecretsService,
    private readonly wow: WowService,
    private readonly importer: WowImportService,
  ) {
    this.publicUrl = config
      .get('PUBLIC_URL', {infer: true})
      .replace(/\/+$/, '');
  }

  /** The Redirect URL the app at develop.battle.net must allow. */
  get redirectUri(): string {
    return `${this.publicUrl}/api/games/battlenet/callback`;
  }

  async state(userId: string): Promise<BattlenetAccountState | null> {
    if (!(await this.wow.hasCredentials(userId))) {
      return null;
    }
    const [token, found] = await Promise.all([
      this.readToken(userId),
      this.readCharacters(userId),
    ]);
    return {
      redirectUri: this.redirectUri,
      expiresAt: token?.expiresAt.toISOString() ?? null,
      discoveredAt: found?.discoveredAt ?? null,
      characters: await this.importer.statuses(userId, found?.characters ?? []),
    };
  }

  async connectUrl(userId: string): Promise<string> {
    const keys = await this.wow.credentials(userId);
    if (!keys) {
      throw new BadRequestException('Battle.net credentials are not set');
    }
    this.forgetOldStates();
    const state = randomBytes(16).toString('hex');
    this.pendingStates.set(state, {
      userId,
      expiresAt: Date.now() + STATE_TTL_MS,
    });
    return authorizeUrl(keys.clientId, this.redirectUri, state);
  }

  /** Returns where to send the browser after the sign-in. */
  async handleCallback(
    code: string | undefined,
    state: string | undefined,
  ): Promise<string> {
    const back = (result: 'connected' | 'error') =>
      `${this.publicUrl}/settings?tab=integrations&battlenet=${result}`;
    const pending = state ? this.pendingStates.get(state) : undefined;
    if (state) {
      this.pendingStates.delete(state);
    }
    if (!code || !pending || pending.expiresAt < Date.now()) {
      return back('error');
    }
    const keys = await this.wow.credentials(pending.userId);
    if (!keys) {
      return back('error');
    }
    try {
      const token = await exchangeCode(keys, code, this.redirectUri);
      await this.secrets.set(
        pending.userId,
        TOKEN_SECRET,
        JSON.stringify({
          accessToken: token.accessToken,
          expiresAt: token.expiresAt.toISOString(),
        }),
      );
      await this.discoverWith(pending.userId, token);
      return back('connected');
    } catch (error) {
      this.logger.warn(`Battle.net sign-in failed: ${String(error)}`);
      return back('error');
    }
  }

  /** "Find characters" again while the sign-in still lasts. */
  async discover(userId: string): Promise<void> {
    const token = await this.readToken(userId);
    if (!token || token.expiresAt.getTime() < Date.now()) {
      throw new BadRequestException('Sign in with Battle.net again');
    }
    await this.discoverWith(userId, token);
  }

  /** "Add" of a found character the page does not have (below level 10, or removed before). */
  async addCharacter(userId: string, key: string): Promise<void> {
    const character = (await this.readCharacters(userId))?.characters.find(
      c => wowCharacterKey(c) === key,
    );
    if (!character) {
      throw new NotFoundException('Character not found');
    }
    await this.importer.addOne(userId, character);
  }

  /** Signs out; the characters already on the Games page stay there. */
  async disconnect(userId: string): Promise<void> {
    await this.secrets.delete(userId, TOKEN_SECRET);
    await this.secrets.delete(userId, CHARACTERS_SECRET);
  }

  /** Every region and version at once; a region without the account answers 404 and is skipped. */
  private async discoverWith(
    userId: string,
    token: BattlenetUserToken,
  ): Promise<void> {
    const answers = await Promise.all(
      WOW_REGIONS.flatMap(region =>
        WOW_VERSIONS.map(version =>
          fetchAccountProfile(token.accessToken, region, version).catch(
            (): AccountProfileAnswer => ({
              region,
              version,
              status: 0,
              body: null,
            }),
          ),
        ),
      ),
    );
    const characters = answers.flatMap(parseAccountProfile);
    this.logger.log(
      `Battle.net account: ${characters.length} character(s); ` +
        answers
          .filter(a => a.status !== 404)
          .map(a => `${a.region}/${a.version} ${a.status}`)
          .join(', '),
    );
    const stored: StoredCharacters = {
      discoveredAt: new Date().toISOString(),
      characters,
    };
    await this.secrets.set(userId, CHARACTERS_SECRET, JSON.stringify(stored));
    // 404 is an answer too: no account there, so no characters.
    const answered = new Set(
      answers
        .filter(a => a.status === 200 || a.status === 404)
        .map(a => `${a.region}/${a.version}`),
    );
    await this.importer.import(userId, characters, answered);
  }

  private async readToken(userId: string): Promise<BattlenetUserToken | null> {
    const stored = await this.secrets.get(userId, TOKEN_SECRET);
    if (!stored) {
      return null;
    }
    const {accessToken, expiresAt} = JSON.parse(stored) as {
      accessToken: string;
      expiresAt: string;
    };
    return {accessToken, expiresAt: new Date(expiresAt)};
  }

  private async readCharacters(
    userId: string,
  ): Promise<StoredCharacters | null> {
    const stored = await this.secrets.get(userId, CHARACTERS_SECRET);
    return stored ? (JSON.parse(stored) as StoredCharacters) : null;
  }

  private forgetOldStates(): void {
    const now = Date.now();
    for (const [state, pending] of this.pendingStates) {
      if (pending.expiresAt < now) {
        this.pendingStates.delete(state);
      }
    }
  }
}

import {BadRequestException, Inject, Injectable, Logger} from '@nestjs/common';
import {ConfigService} from '@nestjs/config';
import {AppConfig, fetchWithTimeout, SecretsService} from '@pd/api-core';
import {
  BattlenetAccountState,
  WOW_ACCOUNT_VERSIONS,
  WOW_REGIONS,
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
 * 3. `handleCallback()` takes the token (about a day, no refresh) and looks for the characters.
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
      characters: found?.characters ?? [],
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
        WOW_ACCOUNT_VERSIONS.map(version =>
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
    await this.probeForever(userId, token, answers);
    const stored: StoredCharacters = {
      discoveredAt: new Date().toISOString(),
      characters,
    };
    await this.secrets.set(userId, CHARACTERS_SECRET, JSON.stringify(stored));
  }

  /**
   * TEMPORARY, until the first real sign-in tells it: what a WoW Forever character looks like
   * and whether its data can be read with the app's keys (no sign-in) or only with the user's
   * token. The answer decides how Forever characters are kept and refreshed.
   */
  private async probeForever(
    userId: string,
    token: BattlenetUserToken,
    answers: AccountProfileAnswer[],
  ): Promise<void> {
    const answer = answers.find(
      a => a.version === 'forever' && a.body?.wow_accounts?.length,
    );
    const raw = answer?.body?.wow_accounts?.[0]?.characters?.[0];
    if (!answer || !raw) {
      return;
    }
    this.logger.log(
      `Forever probe: character fields ${JSON.stringify(raw).slice(0, 1500)}`,
    );
    try {
      const client = await this.wow.clientFor(userId);
      const appStatus = raw.realm?.slug
        ? await client.characterStatus(
            answer.region,
            `profile-forever-${answer.region}`,
            raw.realm.slug,
            raw.name ?? '',
          )
        : null;
      const protectedStatus = raw.protected_character?.href
        ? (
            await fetchWithTimeout(raw.protected_character.href, {
              headers: {Authorization: `Bearer ${token.accessToken}`},
            })
          ).status
        : null;
      this.logger.log(
        `Forever probe: app keys ${appStatus}, user token (protected character) ${protectedStatus}`,
      );
    } catch (error) {
      this.logger.warn(`Forever probe failed: ${String(error)}`);
    }
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

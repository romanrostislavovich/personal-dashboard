import {Inject, Injectable, NotFoundException} from '@nestjs/common';
import {
  ACCESS_TOKEN_PREFIX,
  AccessToken,
  AccessTokenCreated,
  AccessTokenInput,
  AccessTokenScope,
} from '@pd/contracts';
import {and, desc, eq} from 'drizzle-orm';
import {createHash, randomBytes} from 'node:crypto';
import {DB, Database} from '../database/database.module';
import {AccessTokenRow, accessTokens} from './access-tokens.schema';

/** The time of the last use is written at most this often (a client calls many times a minute). */
const TOUCH_EVERY_MS = 60_000;

/** Who a token belongs to and what it may do. */
export interface TokenOwner {
  userId: string;
  scope: AccessTokenScope;
  tokenId: string;
}

const hashOf = (token: string) =>
  createHash('sha256').update(token).digest('hex');

/** Access tokens of the outside AI clients (see `accessTokens`). */
@Injectable()
export class AccessTokensService {
  private readonly touched = new Map<string, number>();

  constructor(@Inject(DB) private readonly db: Database) {}

  async list(userId: string): Promise<AccessToken[]> {
    const rows = await this.db
      .select()
      .from(accessTokens)
      .where(eq(accessTokens.userId, userId))
      .orderBy(desc(accessTokens.createdAt));
    return rows.map(toAccessToken);
  }

  /** A new token: the answer carries it once, the server keeps only its hash. */
  async create(
    userId: string,
    input: AccessTokenInput,
  ): Promise<AccessTokenCreated> {
    const token = `${ACCESS_TOKEN_PREFIX}${randomBytes(32).toString('base64url')}`;
    const [row] = await this.db
      .insert(accessTokens)
      .values({
        userId,
        name: input.name,
        scope: input.scope,
        tokenHash: hashOf(token),
        hint: token.slice(0, ACCESS_TOKEN_PREFIX.length + 4),
      })
      .returning();
    return {...toAccessToken(row), token};
  }

  async revoke(userId: string, id: string): Promise<void> {
    const removed = await this.db
      .delete(accessTokens)
      .where(and(eq(accessTokens.id, id), eq(accessTokens.userId, userId)))
      .returning({id: accessTokens.id});
    if (!removed.length) {
      throw new NotFoundException('Access token not found');
    }
  }

  /** The owner of `Authorization: Bearer pd_…`; `null` — not a token of ours, or revoked. */
  async authenticate(
    authorization: string | undefined,
  ): Promise<TokenOwner | null> {
    const [type, token] = (authorization ?? '').split(' ');
    if (type !== 'Bearer' || !token?.startsWith(ACCESS_TOKEN_PREFIX)) {
      return null;
    }
    const [row] = await this.db
      .select()
      .from(accessTokens)
      .where(eq(accessTokens.tokenHash, hashOf(token)));
    if (!row) {
      return null;
    }
    await this.touch(row.id);
    return {userId: row.userId, scope: row.scope, tokenId: row.id};
  }

  private async touch(id: string): Promise<void> {
    const now = Date.now();
    if (now - (this.touched.get(id) ?? 0) < TOUCH_EVERY_MS) {
      return;
    }
    this.touched.set(id, now);
    await this.db
      .update(accessTokens)
      .set({lastUsedAt: new Date(now)})
      .where(eq(accessTokens.id, id));
  }
}

function toAccessToken(row: AccessTokenRow): AccessToken {
  return {
    id: row.id,
    name: row.name,
    scope: row.scope,
    hint: row.hint,
    createdAt: row.createdAt.toISOString(),
    lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
  };
}

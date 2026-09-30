import { Inject, Injectable } from '@nestjs/common';
import { SessionInfo } from '@pd/contracts';
import { and, desc, eq, lt, ne, or } from 'drizzle-orm';
import { createHash, randomBytes } from 'node:crypto';
import { DB, Database } from '../database/database.module';
import { SessionRow, sessions } from './auth.schema';

/** An unused session ends after this long; every use moves the end forward. */
const SESSION_TTL_MS = 60 * 24 * 60 * 60 * 1000;
/** The refresh token itself is replaced this often (not on every refresh: tabs would race). */
const ROTATE_AFTER_MS = 24 * 60 * 60 * 1000;
/** The replaced token still works this long, for a tab that refreshed at the same moment. */
const PREVIOUS_GRACE_MS = 60 * 1000;
/** The guard asks the database whether a session is alive at most this often. */
const ALIVE_CACHE_MS = 60 * 1000;

export interface ClientMeta {
  userAgent: string | null;
  ip: string | null;
}

export interface Refreshed {
  session: SessionRow;
  /** A new refresh token when the old one was rotated; `null` — keep using the old one. */
  refreshToken: string | null;
}

/** Sign-in sessions and their refresh tokens (see `sessions` in auth.schema.ts). */
@Injectable()
export class SessionsService {
  private readonly alive = new Map<string, { alive: boolean; at: number }>();

  constructor(@Inject(DB) private readonly db: Database) {}

  async create(
    userId: string,
    meta: ClientMeta,
  ): Promise<{ session: SessionRow; refreshToken: string }> {
    await this.db.delete(sessions).where(lt(sessions.expiresAt, new Date()));
    const refreshToken = newToken();
    const [session] = await this.db
      .insert(sessions)
      .values({
        userId,
        tokenHash: hash(refreshToken),
        expiresAt: new Date(Date.now() + SESSION_TTL_MS),
        ...meta,
      })
      .returning();
    return { session, refreshToken };
  }

  /** The session of a refresh token, prolonged and — once a day — with a new token. */
  async refresh(refreshToken: string, meta: ClientMeta): Promise<Refreshed | null> {
    const tokenHash = hash(refreshToken);
    const [session] = await this.db
      .select()
      .from(sessions)
      .where(or(eq(sessions.tokenHash, tokenHash), eq(sessions.previousHash, tokenHash)));
    const now = Date.now();
    if (!session || session.expiresAt.getTime() < now) {
      return null;
    }
    const isPrevious = session.tokenHash !== tokenHash;
    if (isPrevious && now - session.rotatedAt.getTime() > PREVIOUS_GRACE_MS) {
      return null;
    }
    const rotate = !isPrevious && now - session.rotatedAt.getTime() > ROTATE_AFTER_MS;
    const next = rotate ? newToken() : null;
    const [updated] = await this.db
      .update(sessions)
      .set({
        lastUsedAt: new Date(now),
        expiresAt: new Date(now + SESSION_TTL_MS),
        ...meta,
        ...(next && { tokenHash: hash(next), previousHash: tokenHash, rotatedAt: new Date(now) }),
      })
      .where(eq(sessions.id, session.id))
      .returning();
    return { session: updated, refreshToken: next };
  }

  /** Whether the session of an access token still exists (not signed out, not expired). */
  async isAlive(sessionId: string): Promise<boolean> {
    const cached = this.alive.get(sessionId);
    if (cached && Date.now() - cached.at < ALIVE_CACHE_MS) {
      return cached.alive;
    }
    const [row] = await this.db
      .select({ expiresAt: sessions.expiresAt })
      .from(sessions)
      .where(eq(sessions.id, sessionId));
    const alive = !!row && row.expiresAt.getTime() > Date.now();
    this.alive.set(sessionId, { alive, at: Date.now() });
    return alive;
  }

  async list(userId: string, currentId: string | null): Promise<SessionInfo[]> {
    const rows = await this.db
      .select()
      .from(sessions)
      .where(eq(sessions.userId, userId))
      .orderBy(desc(sessions.lastUsedAt));
    return rows.map((row) => ({
      id: row.id,
      createdAt: row.createdAt.toISOString(),
      lastUsedAt: row.lastUsedAt.toISOString(),
      userAgent: row.userAgent,
      ip: row.ip,
      current: row.id === currentId,
    }));
  }

  async revoke(userId: string, sessionId: string): Promise<void> {
    await this.db
      .delete(sessions)
      .where(and(eq(sessions.id, sessionId), eq(sessions.userId, userId)));
    this.alive.set(sessionId, { alive: false, at: Date.now() });
  }

  async revokeByToken(refreshToken: string): Promise<void> {
    const [row] = await this.db
      .delete(sessions)
      .where(eq(sessions.tokenHash, hash(refreshToken)))
      .returning({ id: sessions.id });
    if (row) {
      this.alive.set(row.id, { alive: false, at: Date.now() });
    }
  }

  /** Every other device signs out (after a password change, or on request). */
  async revokeOthers(userId: string, keepId: string | null): Promise<void> {
    const rows = await this.db
      .delete(sessions)
      .where(and(eq(sessions.userId, userId), keepId ? ne(sessions.id, keepId) : undefined))
      .returning({ id: sessions.id });
    rows.forEach((row) => this.alive.set(row.id, { alive: false, at: Date.now() }));
  }
}

function newToken(): string {
  return randomBytes(32).toString('base64url');
}

function hash(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

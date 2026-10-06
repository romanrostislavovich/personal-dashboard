import { JwtService } from '@nestjs/jwt';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { sql } from 'drizzle-orm';
import { join } from 'node:path';
import { Pool } from 'pg';
import { AppConfig } from '../config/env';
import { Database } from '../database/database.module';
import { SecretsService } from '../secrets/secrets.service';
import { SignInLog } from '../security/sign-in-log.service';
import { UsersService } from '../users/users.service';
import { AuthService } from './auth.service';
import { SessionsService } from './sessions.service';
import { totpCode } from './totp';
import { TwoFactorService } from './two-factor.service';

/**
 * Signing in on a real database: sessions and refresh tokens, two-factor sign-in, the throttle.
 * Needs PostgreSQL: set TEST_DATABASE_URL like for `sync-store.db.spec.ts`.
 */
const ADMIN_URL = process.env['TEST_DATABASE_URL'];
const MIGRATIONS = join(import.meta.dirname, '../../../../../../apps/api/migrations');
const DATABASE = 'pd_test_auth';
const META = { userAgent: 'test', ip: '10.0.0.1' };

describe.skipIf(!ADMIN_URL)('AuthService', { timeout: 60_000 }, () => {
  let admin: Pool;
  let pool: Pool;
  let db: Database;
  let auth: AuthService;
  let sessions: SessionsService;
  let twoFactor: TwoFactorService;
  const jwt = new JwtService({ secret: 'x'.repeat(32) });

  beforeAll(async () => {
    admin = new Pool({ connectionString: ADMIN_URL });
    await admin.query(`DROP DATABASE IF EXISTS ${DATABASE} WITH (FORCE)`);
    await admin.query(`CREATE DATABASE ${DATABASE}`);
    const url = new URL(ADMIN_URL as string);
    url.pathname = `/${DATABASE}`;
    pool = new Pool({ connectionString: url.toString() });
    pool.on('error', () => undefined);
    const drizzleDb = drizzle({ client: pool, casing: 'snake_case' });
    await migrate(drizzleDb, { migrationsFolder: MIGRATIONS });
    db = drizzleDb as unknown as Database;

    const config = {
      get: (key: string) => ({ ENCRYPTION_KEY: 'k'.repeat(32), ALLOW_REGISTRATION: true })[key],
    } as unknown as AppConfig;
    const users = new UsersService(db, config);
    sessions = new SessionsService(db);
    twoFactor = new TwoFactorService(new SecretsService(db, config));
    auth = new AuthService(users, jwt, sessions, twoFactor, new SignInLog(db), config);
    await auth.register(
      {
        email: 'me@test.local',
        password: 'correct horse',
        displayName: 'Me',
        locale: 'en',
        client: 'app',
      },
      'app',
      META,
    );
  });

  afterAll(async () => {
    await pool?.end();
    await admin?.query(`DROP DATABASE IF EXISTS ${DATABASE} WITH (FORCE)`);
    await admin?.end();
  });

  const login = (password = 'correct horse', ip = META.ip) =>
    auth.login({ email: 'me@test.local', password, client: 'app' }, { ...META, ip });

  it('signs in: a short access token of a session, and a refresh token', async () => {
    const { result, refreshToken } = await login();
    expect(refreshToken).toBeTruthy();
    expect('accessToken' in result && result.refreshToken).toBe(refreshToken);
    const payload = jwt.decode(('accessToken' in result && result.accessToken) as string) as {
      sid: string;
      exp: number;
      iat: number;
    };
    expect(payload.exp - payload.iat).toBe(15 * 60);
    expect(await sessions.isAlive(payload.sid)).toBe(true);
  });

  it('refreshes; rotates once a day, and the old token works for a minute after that', async () => {
    const { refreshToken } = await login();
    const same = await auth.refresh(refreshToken as string, META);
    expect(same.refreshToken).toBeNull(); // Not rotated within a day.

    // A day later the token is rotated…
    await db.execute(sql`UPDATE auth.sessions SET rotated_at = now() - interval '2 days'`);
    const rotated = await auth.refresh(refreshToken as string, META);
    expect(rotated.refreshToken).toBeTruthy();
    // …the old one still works for a racing tab, then no more.
    expect((await auth.refresh(refreshToken as string, META)).refreshToken).toBeNull();
    await db.execute(sql`UPDATE auth.sessions SET rotated_at = now() - interval '2 minutes'`);
    await expect(auth.refresh(refreshToken as string, META)).rejects.toThrow('Signed out');
    expect(await auth.refresh(rotated.refreshToken as string, META)).toBeTruthy();
  });

  it('signing out ends the session; a new password signs other devices out', async () => {
    const first = await login();
    await auth.logout(first.refreshToken as string);
    await expect(auth.refresh(first.refreshToken as string, META)).rejects.toThrow();

    const kept = await login();
    const other = await login();
    const keptSid = (
      jwt.decode(('accessToken' in kept.result && kept.result.accessToken) as string) as {
        sid: string;
      }
    ).sid;
    const [user] = await db.execute<{ id: string }>(sql`SELECT id FROM users`).then((r) => r.rows);
    await auth.changePassword(user.id, keptSid, {
      currentPassword: 'correct horse',
      newPassword: 'battery staple',
    });
    await expect(auth.refresh(other.refreshToken as string, META)).rejects.toThrow();
    expect(await auth.refresh(kept.refreshToken as string, META)).toBeTruthy();
    await auth.changePassword(user.id, keptSid, {
      currentPassword: 'battery staple',
      newPassword: 'correct horse',
    });
  });

  it('with two-factor sign-in, the password gives a challenge and the code the session', async () => {
    const [user] = await db.execute<{ id: string }>(sql`SELECT id FROM users`).then((r) => r.rows);
    const { secret } = await twoFactor.setup(user.id, 'me@test.local');
    const codes = await twoFactor.enable(user.id, totpCode(secret, Date.now()));
    expect(codes?.recoveryCodes).toHaveLength(10);

    const { result } = await login();
    expect(result).toMatchObject({ twoFactorRequired: true });
    const challengeToken = (result as { challengeToken: string }).challengeToken;
    await expect(auth.loginWithCode({ challengeToken, code: '000000' }, META)).rejects.toThrow(
      'Wrong code',
    );
    const signedIn = await auth.loginWithCode(
      { challengeToken, code: totpCode(secret, Date.now()) },
      META,
    );
    expect(signedIn.response.accessToken).toBeTruthy();

    // A recovery code works once.
    const recovery = codes?.recoveryCodes[0] as string;
    const again = (await login()).result as { challengeToken: string };
    await auth.loginWithCode({ challengeToken: again.challengeToken, code: recovery }, META);
    const third = (await login()).result as { challengeToken: string };
    await expect(
      auth.loginWithCode({ challengeToken: third.challengeToken, code: recovery }, META),
    ).rejects.toThrow('Wrong code');
    expect((await twoFactor.status(user.id)).recoveryCodesLeft).toBe(9);
    await twoFactor.disable(user.id);
  });

  it('refuses after too many wrong passwords', async () => {
    for (let i = 0; i < 10; i++) {
      await expect(login('wrong', '10.9.9.9')).rejects.toThrow('Invalid email or password');
    }
    // The account is locked from any address now, the right password included.
    await expect(login('correct horse', '10.8.8.8')).rejects.toThrow('Too many attempts');
  });

  it('journals the sign-ins: the failed ones with their address, not the refused ones', async () => {
    const { rows } = await pool.query(
      `SELECT outcome, ip, count(*)::int AS attempts FROM auth.sign_ins
       WHERE ip IN ('10.9.9.9', '10.8.8.8') GROUP BY outcome, ip`,
    );
    // Ten wrong passwords are kept; the attempt refused for too many (429) is not.
    expect(rows).toEqual([{ outcome: 'wrong-password', ip: '10.9.9.9', attempts: 10 }]);
    const { rows: good } = await pool.query(
      `SELECT count(*)::int AS attempts FROM auth.sign_ins WHERE outcome = 'ok'`,
    );
    expect(good[0].attempts).toBeGreaterThan(0);
  });
});

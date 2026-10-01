import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  OnApplicationBootstrap,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  AuthClient,
  AuthConfig,
  CurrentUser,
  loginSchema,
  LoginResponse,
  LoginResult,
  PasswordChange,
  ProfileUpdate,
  registerSchema,
  TwoFactorLogin,
} from '@pd/contracts';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { AppConfig } from '../config/env';
import { UserRow } from '../users/users.schema';
import { UsersService } from '../users/users.service';
import { LoginThrottle, throttleKeys } from './login-throttle';
import { ClientMeta, SessionsService } from './sessions.service';
import { TwoFactorService } from './two-factor.service';

const BCRYPT_ROUNDS = 12;
/** Access tokens are short: a stolen one is useless soon, the refresh token gives new ones. */
const ACCESS_TOKEN_TTL = '15m';
/** Between the password and the 2FA code. */
const CHALLENGE_TTL = '5m';

/** What an access token carries; `sid` — the session it belongs to. */
export interface AccessPayload {
  sub: string;
  email: string;
  sid: string;
}

/** A signed-in session: the response, and the refresh token for the cookie or the app. */
export interface IssuedSession {
  response: LoginResponse;
  refreshToken: string | null;
}

type LoginInput = z.output<typeof loginSchema>;

@Injectable()
export class AuthService implements OnApplicationBootstrap {
  private readonly logger = new Logger(AuthService.name);
  private readonly throttle = new LoginThrottle();

  constructor(
    private readonly users: UsersService,
    private readonly jwt: JwtService,
    private readonly sessions: SessionsService,
    private readonly twoFactor: TwoFactorService,
    @Inject(ConfigService) private readonly config: AppConfig,
  ) {}

  /** On first start, create the administrator from ADMIN_EMAIL / ADMIN_PASSWORD. */
  async onApplicationBootstrap(): Promise<void> {
    if ((await this.users.count()) > 0) {
      return;
    }
    if (this.config.get('SYNC_MODE', { infer: true }) !== 'off') {
      // The user arrives with the first sync; a second admin with a different id would clash.
      this.logger.warn('No users yet: they will arrive with the first sync (see docs/sync.md)');
      return;
    }
    const email = this.config.get('ADMIN_EMAIL', { infer: true });
    const password = this.config.get('ADMIN_PASSWORD', { infer: true });
    if (!email || !password) {
      this.logger.warn('No users yet. Set ADMIN_EMAIL and ADMIN_PASSWORD to create the first one.');
      return;
    }
    await this.users.create({
      email,
      passwordHash: await bcrypt.hash(password, BCRYPT_ROUNDS),
      displayName: email.split('@')[0],
      locale: this.config.get('DEFAULT_LOCALE', { infer: true }),
    });
    this.logger.log(`Created first user ${email}`);
  }

  publicConfig(): AuthConfig {
    return { registrationEnabled: this.config.get('ALLOW_REGISTRATION', { infer: true }) };
  }

  /** The password step; with 2FA on it ends with a challenge for the code. */
  async login(
    { email, password, client }: LoginInput,
    meta: ClientMeta,
  ): Promise<{ result: LoginResult; refreshToken: string | null }> {
    const keys = throttleKeys(meta.ip ?? undefined, email);
    this.throttle.check(keys);
    const user = await this.users.findByEmail(email);
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      this.throttle.fail(keys);
      throw new UnauthorizedException('Invalid email or password');
    }
    this.throttle.succeed(keys);
    if (await this.twoFactor.isEnabled(user.id)) {
      const challengeToken = await this.jwt.signAsync(
        { sub: user.id, purpose: '2fa', client },
        { expiresIn: CHALLENGE_TTL },
      );
      return { result: { twoFactorRequired: true, challengeToken }, refreshToken: null };
    }
    const { response, refreshToken } = await this.issueSession(user, client, meta);
    return { result: response, refreshToken };
  }

  /** The second step: a code from the app (or a recovery code) for the challenge. */
  async loginWithCode({ challengeToken, code }: TwoFactorLogin, meta: ClientMeta) {
    const challenge = await this.jwt
      .verifyAsync<{ sub: string; purpose: string; client: AuthClient }>(challengeToken)
      .catch(() => null);
    if (!challenge || challenge.purpose !== '2fa') {
      throw new UnauthorizedException('The sign-in took too long, start again');
    }
    const keys = [`2fa:${challenge.sub}`, `ip:${meta.ip ?? 'unknown'}`];
    this.throttle.check(keys);
    if (!(await this.twoFactor.verify(challenge.sub, code))) {
      this.throttle.fail(keys);
      throw new UnauthorizedException('Wrong code');
    }
    this.throttle.succeed(keys);
    return this.issueSession(await this.requireUser(challenge.sub), challenge.client, meta);
  }

  /** Sign-up works only if the server allows it (ALLOW_REGISTRATION=true). */
  async register(
    input: z.output<typeof registerSchema>,
    client: AuthClient,
    meta: ClientMeta,
  ): Promise<IssuedSession> {
    if (!this.publicConfig().registrationEnabled) {
      throw new ForbiddenException('Registration is disabled');
    }
    if (await this.users.findByEmail(input.email)) {
      throw new ConflictException('Email is already registered');
    }
    const user = await this.users.create({
      email: input.email,
      passwordHash: await bcrypt.hash(input.password, BCRYPT_ROUNDS),
      displayName: input.displayName,
      locale: input.locale,
    });
    return this.issueSession(user, client, meta);
  }

  /** A new access token for a refresh token (a rotated one, once a day, comes along). */
  async refresh(refreshToken: string, meta: ClientMeta): Promise<IssuedSession> {
    const refreshed = await this.sessions.refresh(refreshToken, meta);
    if (!refreshed) {
      throw new UnauthorizedException('Signed out');
    }
    const user = await this.requireUser(refreshed.session.userId);
    return {
      response: {
        accessToken: await this.accessToken(user, refreshed.session.id),
        user: toCurrentUser(user),
      },
      refreshToken: refreshed.refreshToken,
    };
  }

  logout(refreshToken: string): Promise<void> {
    return this.sessions.revokeByToken(refreshToken);
  }

  async me(userId: string): Promise<CurrentUser> {
    return toCurrentUser(await this.requireUser(userId));
  }

  async updateProfile(userId: string, changes: ProfileUpdate): Promise<CurrentUser> {
    return toCurrentUser(await this.users.update(userId, changes));
  }

  /** A new password signs every other device out: whoever knew the old one is out too. */
  async changePassword(
    userId: string,
    sessionId: string | null,
    { currentPassword, newPassword }: PasswordChange,
  ) {
    const user = await this.requireUser(userId);
    if (!(await bcrypt.compare(currentPassword, user.passwordHash))) {
      throw new BadRequestException('Current password is incorrect');
    }
    await this.users.update(userId, {
      passwordHash: await bcrypt.hash(newPassword, BCRYPT_ROUNDS),
    });
    await this.sessions.revokeOthers(userId, sessionId);
  }

  /** Turning 2FA off asks for the password and a code: a stolen session alone is not enough. */
  async checkPassword(userId: string, password: string): Promise<void> {
    const user = await this.requireUser(userId);
    const keys = [`password:${userId}`];
    this.throttle.check(keys);
    if (!(await bcrypt.compare(password, user.passwordHash))) {
      this.throttle.fail(keys);
      throw new BadRequestException('Current password is incorrect');
    }
  }

  private async issueSession(
    user: UserRow,
    client: AuthClient,
    meta: ClientMeta,
  ): Promise<IssuedSession> {
    const { session, refreshToken } = await this.sessions.create(user.id, meta);
    const response: LoginResponse = {
      accessToken: await this.accessToken(user, session.id),
      user: toCurrentUser(user),
      ...(client === 'app' && { refreshToken }),
    };
    return { response, refreshToken };
  }

  private accessToken(user: UserRow, sessionId: string): Promise<string> {
    const payload: AccessPayload = { sub: user.id, email: user.email, sid: sessionId };
    return this.jwt.signAsync(payload, { expiresIn: ACCESS_TOKEN_TTL });
  }

  private async requireUser(userId: string): Promise<UserRow> {
    const user = await this.users.findById(userId);
    if (!user) {
      throw new UnauthorizedException();
    }
    return user;
  }
}

function toCurrentUser(user: UserRow): CurrentUser {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    locale: user.locale,
    timeZone: user.timeZone,
  };
}

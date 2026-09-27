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
  AuthConfig,
  CurrentUser,
  LoginRequest,
  LoginResponse,
  PasswordChange,
  ProfileUpdate,
  registerSchema,
} from '@pd/contracts';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { AppConfig } from '../config/env';
import { UserRow } from '../users/users.schema';
import { UsersService } from '../users/users.service';

const BCRYPT_ROUNDS = 12;

@Injectable()
export class AuthService implements OnApplicationBootstrap {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly users: UsersService,
    private readonly jwt: JwtService,
    @Inject(ConfigService) private readonly config: AppConfig,
  ) {}

  /** При первом запуске создаём администратора из ADMIN_EMAIL / ADMIN_PASSWORD. */
  async onApplicationBootstrap(): Promise<void> {
    if ((await this.users.count()) > 0) {
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

  async login({ email, password }: LoginRequest): Promise<LoginResponse> {
    const user = await this.users.findByEmail(email);
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      throw new UnauthorizedException('Invalid email or password');
    }
    return this.issueToken(user);
  }

  /** Регистрация — только если сервер разрешает (ALLOW_REGISTRATION=true). */
  async register(input: z.output<typeof registerSchema>): Promise<LoginResponse> {
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
    return this.issueToken(user);
  }

  async me(userId: string): Promise<CurrentUser> {
    return toCurrentUser(await this.requireUser(userId));
  }

  async updateProfile(userId: string, changes: ProfileUpdate): Promise<CurrentUser> {
    return toCurrentUser(await this.users.update(userId, changes));
  }

  async changePassword(userId: string, { currentPassword, newPassword }: PasswordChange) {
    const user = await this.requireUser(userId);
    if (!(await bcrypt.compare(currentPassword, user.passwordHash))) {
      throw new BadRequestException('Current password is incorrect');
    }
    await this.users.update(userId, {
      passwordHash: await bcrypt.hash(newPassword, BCRYPT_ROUNDS),
    });
  }

  private async issueToken(user: UserRow): Promise<LoginResponse> {
    const accessToken = await this.jwt.signAsync({ sub: user.id, email: user.email });
    return { accessToken, user: toCurrentUser(user) };
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
  return { id: user.id, email: user.email, displayName: user.displayName, locale: user.locale };
}

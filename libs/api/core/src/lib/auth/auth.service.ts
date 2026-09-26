import {
  Inject,
  Injectable,
  Logger,
  OnApplicationBootstrap,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { CurrentUser, LoginRequest, LoginResponse } from '@pd/contracts';
import bcrypt from 'bcryptjs';
import { AppConfig } from '../config/env';
import { UserRow } from '../users/users.schema';
import { UsersService } from '../users/users.service';

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
      passwordHash: await bcrypt.hash(password, 12),
      displayName: email.split('@')[0],
    });
    this.logger.log(`Created first user ${email}`);
  }

  async login({ email, password }: LoginRequest): Promise<LoginResponse> {
    const user = await this.users.findByEmail(email);
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      throw new UnauthorizedException('Invalid email or password');
    }
    const accessToken = await this.jwt.signAsync({ sub: user.id, email: user.email });
    return { accessToken, user: toCurrentUser(user) };
  }

  async me(userId: string): Promise<CurrentUser> {
    const user = await this.users.findById(userId);
    if (!user) {
      throw new UnauthorizedException();
    }
    return toCurrentUser(user);
  }
}

function toCurrentUser(user: UserRow): CurrentUser {
  return { id: user.id, email: user.email, displayName: user.displayName, locale: user.locale };
}

import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { asc, eq } from 'drizzle-orm';
import { AppConfig } from '../config/env';
import { DB, Database } from '../database/database.module';
import { UserRow, users } from './users.schema';

@Injectable()
export class UsersService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(ConfigService) private readonly config: AppConfig,
  ) {}

  async findById(id: string): Promise<UserRow | undefined> {
    const [user] = await this.db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async findByEmail(email: string): Promise<UserRow | undefined> {
    const [user] = await this.db.select().from(users).where(eq(users.email, email.toLowerCase()));
    return user;
  }

  async findByTelegramChatId(chatId: string): Promise<UserRow | undefined> {
    const [user] = await this.db.select().from(users).where(eq(users.telegramChatId, chatId));
    return user;
  }

  /** Used by background jobs that iterate over all users. */
  findAll(): Promise<UserRow[]> {
    return this.db.select().from(users);
  }

  /**
   * The first user — the one who runs the instance. Hears about the instance itself (backups,
   * sync) and sees sync conflicts of rows that belong to no user.
   */
  async owner(): Promise<UserRow | undefined> {
    const [user] = await this.db.select().from(users).orderBy(asc(users.createdAt)).limit(1);
    return user;
  }

  /**
   * The zone the user lives in: the one of their device, sent by the client. Until a client has
   * told it, the server's own zone (APP_TIMEZONE). Everything about "today" and "at 9:00" for a
   * user goes through this — the server may stand anywhere.
   */
  timeZoneOf(user: Pick<UserRow, 'timeZone'> | undefined): string {
    return user?.timeZone ?? this.config.get('APP_TIMEZONE', { infer: true });
  }

  async count(): Promise<number> {
    return this.db.$count(users);
  }

  async create(data: {
    email: string;
    passwordHash: string;
    displayName: string;
    locale: string;
  }): Promise<UserRow> {
    const [user] = await this.db
      .insert(users)
      .values({ ...data, email: data.email.toLowerCase() })
      .returning();
    return user;
  }

  async update(
    userId: string,
    changes: Partial<
      Pick<UserRow, 'displayName' | 'locale' | 'passwordHash' | 'timeZone' | 'theme' | 'layout'>
    >,
  ): Promise<UserRow> {
    const [user] = await this.db.update(users).set(changes).where(eq(users.id, userId)).returning();
    return user;
  }

  async setTelegramChatId(userId: string, chatId: string | null): Promise<void> {
    await this.db.update(users).set({ telegramChatId: chatId }).where(eq(users.id, userId));
  }
}

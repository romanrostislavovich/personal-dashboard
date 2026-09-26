import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DB, Database } from '../database/database.module';
import { UserRow, users } from './users.schema';

@Injectable()
export class UsersService {
  constructor(@Inject(DB) private readonly db: Database) {}

  async findById(id: string): Promise<UserRow | undefined> {
    const [user] = await this.db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async findByEmail(email: string): Promise<UserRow | undefined> {
    const [user] = await this.db.select().from(users).where(eq(users.email, email.toLowerCase()));
    return user;
  }

  /** Используется фоновыми задачами, которые обходят всех пользователей. */
  findAll(): Promise<UserRow[]> {
    return this.db.select().from(users);
  }

  async count(): Promise<number> {
    return this.db.$count(users);
  }

  async create(data: {
    email: string;
    passwordHash: string;
    displayName: string;
  }): Promise<UserRow> {
    const [user] = await this.db
      .insert(users)
      .values({ ...data, email: data.email.toLowerCase() })
      .returning();
    return user;
  }

  async setTelegramChatId(userId: string, chatId: string | null): Promise<void> {
    await this.db.update(users).set({ telegramChatId: chatId }).where(eq(users.id, userId));
  }
}

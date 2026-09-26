import {
  Global,
  Inject,
  Logger,
  Module,
  OnApplicationShutdown,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { drizzle, NodePgDatabase } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { join } from 'node:path';
import { Pool } from 'pg';
import { AppConfig } from '../config/env';

/** Токен для инъекции: `constructor(@Inject(DB) private readonly db: Database)`. */
export const DB = Symbol('DB');
export type Database = NodePgDatabase;

const PG_POOL = Symbol('PG_POOL');

/**
 * Подключение к PostgreSQL через Drizzle.
 * Таблицы каждый модуль описывает сам в своих `*.schema.ts`,
 * а миграции генерируются одним `npm run db:generate` для всего проекта.
 */
@Global()
@Module({
  providers: [
    {
      provide: PG_POOL,
      inject: [ConfigService],
      useFactory: (config: AppConfig) =>
        new Pool({ connectionString: config.get('DATABASE_URL', { infer: true }) }),
    },
    {
      provide: DB,
      inject: [PG_POOL],
      // snake_case: поле `passwordHash` в коде = колонка `password_hash` в БД.
      useFactory: (pool: Pool) => drizzle({ client: pool, casing: 'snake_case' }),
    },
  ],
  exports: [DB],
})
export class DatabaseModule implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(DatabaseModule.name);

  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(PG_POOL) private readonly pool: Pool,
  ) {}

  async onModuleInit(): Promise<void> {
    // Папка migrations копируется рядом с main.js при сборке (см. apps/api/webpack.config.js).
    await migrate(this.db, { migrationsFolder: join(__dirname, 'migrations') });
    this.logger.log('Database migrations applied');
  }

  async onApplicationShutdown(): Promise<void> {
    await this.pool.end();
  }
}

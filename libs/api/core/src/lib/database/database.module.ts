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
import { configureFieldEncryption } from '../crypto/encrypted-columns';

/** Injection token: `constructor(@Inject(DB) private readonly db: Database)`. */
export const DB = Symbol('DB');
export type Database = NodePgDatabase;

const PG_POOL = Symbol('PG_POOL');

/**
 * PostgreSQL connection through Drizzle.
 * Each module describes its own tables in its `*.schema.ts`,
 * and migrations are generated for the whole project by one `npm run db:generate`.
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
      inject: [PG_POOL, ConfigService],
      useFactory: (pool: Pool, config: AppConfig) => {
        // Before any row is read: encrypted columns need the key (see encrypted-columns.ts).
        configureFieldEncryption(config.get('ENCRYPTION_KEY', { infer: true }));
        // snake_case: the `passwordHash` field in code = the `password_hash` column in the database.
        return drizzle({ client: pool, casing: 'snake_case' });
      },
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
    // The migrations folder is copied next to main.js during the build (see apps/api/webpack.config.js).
    await migrate(this.db, { migrationsFolder: join(__dirname, 'migrations') });
    this.logger.log('Database migrations applied');
  }

  async onApplicationShutdown(): Promise<void> {
    await this.pool.end();
  }
}

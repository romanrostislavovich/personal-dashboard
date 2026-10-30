import {
  Inject,
  Injectable,
  Logger,
  OnApplicationBootstrap,
} from '@nestjs/common';
import {ConfigService} from '@nestjs/config';
import {eq, isNotNull, or, sql, SQL} from 'drizzle-orm';
import {getTableConfig, PgColumn, PgTable} from 'drizzle-orm/pg-core';
import {AppConfig} from '../config/env';
import {DB, Database} from '../database/database.module';

/** Rows encrypted in one go: a large diary is done in pieces, without a long lock. */
const BATCH = 200;
/** The start of an encrypted value (see encrypted-columns.ts). */
const TEXT_PREFIX = 'enc:v1:';
const BYTES_MAGIC_HEX = Buffer.from('PDENC1').toString('hex');

/** A table whose columns became encrypted after it already had rows. */
export interface EncryptedLater {
  table: PgTable;
  id: PgColumn;
  /** Property name (as in the schema) → its column; text or bytes, declared encrypted. */
  columns: Record<string, PgColumn>;
  /** Anything else to set on the same rows (the word count of a diary entry, say). */
  extra?: (row: Record<string, unknown>) => Record<string, unknown>;
}

/**
 * Encrypts the rows written before their columns were made encrypted. A column read through
 * `encryptedText()` / `encryptedBytes()` takes plain values as they are, so nothing breaks
 * meanwhile; this only makes the stored copy — and the dumps and backups after it — ciphertext.
 *
 * A module registers its tables in `onModuleInit`; the work runs once the app is up, in batches,
 * and is a no-op when nothing is left. A sync client leaves it to the server: both doing it
 * would make every row a conflict, and the server's rows come over encrypted anyway.
 */
@Injectable()
export class EncryptExistingService implements OnApplicationBootstrap {
  private readonly logger = new Logger(EncryptExistingService.name);
  private readonly tables: EncryptedLater[] = [];

  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(ConfigService) private readonly config: AppConfig,
  ) {}

  register(table: EncryptedLater): void {
    this.tables.push(table);
  }

  onApplicationBootstrap(): void {
    if (this.config.get('SYNC_MODE', {infer: true}) === 'client') {
      return;
    }
    // Not awaited: the app takes requests meanwhile, and a failure is only logged.
    void this.run().catch(error =>
      this.logger.error(`Encrypting stored rows failed: ${error}`),
    );
  }

  async run(): Promise<void> {
    for (const entry of this.tables) {
      const done = await this.encrypt(entry);
      if (done) {
        this.logger.log(
          `Encrypted ${done} stored row(s) of ${getTableConfig(entry.table).name}`,
        );
      }
    }
  }

  /** How many rows it encrypted. */
  async encrypt({table, id, columns, extra}: EncryptedLater): Promise<number> {
    const plain = or(...Object.values(columns).map(isStoredPlain)) as SQL;
    let done = 0;
    for (;;) {
      const rows = (await this.db
        .select({id, ...columns})
        .from(table)
        .where(plain)
        .limit(BATCH)) as Record<string, unknown>[];
      for (const row of rows) {
        const values: Record<string, unknown> = {};
        for (const key of Object.keys(columns)) {
          values[key] = row[key];
        }
        // Written back through Drizzle: the column type encrypts it on the way.
        await this.db
          .update(table)
          .set({...values, ...extra?.(row)} as never)
          .where(eq(id, row['id']));
      }
      done += rows.length;
      if (rows.length < BATCH) {
        return done;
      }
    }
  }
}

/** A value that is there and not encrypted yet. */
function isStoredPlain(column: PgColumn): SQL {
  const notEncrypted =
    column.getSQLType() === 'bytea'
      ? sql`substring(${column} from 1 for 6) <> decode(${BYTES_MAGIC_HEX}, 'hex')`
      : sql`${column} NOT LIKE ${`${TEXT_PREFIX}%`}`;
  return sql`(${isNotNull(column)} AND ${notEncrypted})`;
}

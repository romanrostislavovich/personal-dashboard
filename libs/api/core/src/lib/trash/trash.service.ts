import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  OnApplicationBootstrap,
  OnModuleInit,
} from '@nestjs/common';
import { TrashItem } from '@pd/contracts';
import { sql } from 'drizzle-orm';
import { DB, Database } from '../database/database.module';
import { isForeignKeyViolation } from '../database/pg-errors';
import { SchedulerService } from '../scheduler/scheduler.service';
import { readSyncTables } from '../sync/sync-catalog';
import { installTrashTriggers } from './trash-triggers';

/** Deleted rows are kept this long. */
const KEEP_DAYS = 30;
/** Row fields that name what was deleted, in order of preference. */
const LABEL_FIELDS = [
  'name',
  'title',
  'full_name',
  'display_name',
  'url',
  'category',
  'day',
  'track',
];

/**
 * The trash: everything deleted — by hand or by the assistant — can be brought back for 30 days
 * (a trigger keeps the rows, see trash-triggers.ts). One item is one transaction: an account
 * comes back with its matches, a project with its transactions.
 */
@Injectable()
export class TrashService implements OnModuleInit, OnApplicationBootstrap {
  private readonly logger = new Logger(TrashService.name);
  /** Tables in foreign key order: parents are restored before their children. */
  private order: Promise<Map<string, number>> | null = null;

  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly scheduler: SchedulerService,
  ) {}

  onModuleInit(): void {
    this.scheduler.register({
      name: 'trash.purge',
      cron: '15 4 * * *',
      handler: () => this.purge(),
    });
  }

  /** After the migrations (DatabaseModule runs them on init): every table then exists. */
  async onApplicationBootstrap(): Promise<void> {
    const installed = await installTrashTriggers(this.db);
    if (installed.length) {
      this.logger.log(`Trash kept for: ${installed.join(', ')}`);
    }
  }

  async list(userId: string): Promise<TrashItem[]> {
    // A photo's bytes and a diary's text are not needed to name an item.
    const { rows } = await this.db.execute<{
      tx: string;
      table_name: string;
      count: number;
      deleted_at: string;
      sample: Record<string, unknown>;
    }>(sql`
      WITH mine AS (SELECT DISTINCT tx FROM trash.rows WHERE user_id = ${userId})
      SELECT r.tx::text AS tx, r.table_name, count(*)::int AS count,
        min(r.deleted_at)::text AS deleted_at,
        (array_agg(r.row - 'data' - 'content' ORDER BY r.id))[1] AS sample
      FROM trash.rows r JOIN mine USING (tx)
      GROUP BY r.tx, r.table_name
    `);
    const order = await this.tableOrder();
    const items = new Map<string, TrashItem & { rank: number }>();
    for (const row of rows) {
      const rank = order.get(row.table_name) ?? Number.MAX_SAFE_INTEGER;
      const item = items.get(row.tx) ?? {
        id: row.tx,
        deletedAt: new Date(row.deleted_at).toISOString(),
        table: row.table_name,
        label: null,
        rows: 0,
        parts: [],
        rank: Number.MAX_SAFE_INTEGER,
      };
      item.rows += row.count;
      item.parts.push({ table: row.table_name, count: row.count });
      // The item is named after its topmost row: the account, not one of its matches.
      if (rank < item.rank) {
        item.rank = rank;
        item.table = row.table_name;
        item.label = labelOf(row.sample);
      }
      items.set(row.tx, item);
    }
    return [...items.values()]
      .map(({ rank: _rank, ...item }) => ({
        ...item,
        parts: item.parts.sort((a, b) => (order.get(a.table) ?? 0) - (order.get(b.table) ?? 0)),
      }))
      .sort((a, b) => b.deletedAt.localeCompare(a.deletedAt));
  }

  /** Puts the item's rows back, parents first; a row that exists again is left as it is. */
  async restore(userId: string, id: string): Promise<void> {
    await this.requireOwned(userId, id);
    const order = await this.tableOrder();
    try {
      await this.db.transaction(async (tx) => {
        const { rows } = await tx.execute<{ table_name: string; row: string }>(sql`
          SELECT table_name, row::text AS row FROM trash.rows WHERE tx = ${id}::xid8 ORDER BY id
        `);
        const sorted = [...rows].sort(
          (a, b) => (order.get(a.table_name) ?? 0) - (order.get(b.table_name) ?? 0),
        );
        for (const { table_name, row } of sorted) {
          const name = sql.identifier(table_name);
          await tx.execute(sql`
            INSERT INTO ${name} SELECT * FROM jsonb_populate_record(NULL::${name}, ${row}::jsonb)
            ON CONFLICT DO NOTHING
          `);
        }
        await tx.execute(sql`DELETE FROM trash.rows WHERE tx = ${id}::xid8`);
      });
    } catch (error) {
      if (isForeignKeyViolation(error)) {
        // A parent that was deleted separately (a project before its transaction) comes first.
        throw new ConflictException('Restore the item it belonged to first');
      }
      throw error;
    }
  }

  /** Deletes the item for good. */
  async remove(userId: string, id: string): Promise<void> {
    await this.requireOwned(userId, id);
    await this.db.execute(sql`DELETE FROM trash.rows WHERE tx = ${id}::xid8`);
  }

  /** Every night: older than 30 days, and the trash of users who are gone. */
  async purge(): Promise<void> {
    await this.db.execute(sql`
      DELETE FROM trash.rows
      WHERE deleted_at < now() - make_interval(days => ${KEEP_DAYS})
        OR (user_id IS NOT NULL AND user_id NOT IN (SELECT id FROM users))
    `);
  }

  private async requireOwned(userId: string, id: string): Promise<void> {
    if (!/^\d+$/.test(id)) {
      throw new BadRequestException('Unknown item');
    }
    const { rows } = await this.db.execute<{ found: boolean }>(sql`
      SELECT EXISTS (SELECT 1 FROM trash.rows WHERE tx = ${id}::xid8 AND user_id = ${userId})
        AS found
    `);
    if (!rows[0]?.found) {
      throw new NotFoundException('Not in the trash');
    }
  }

  private tableOrder(): Promise<Map<string, number>> {
    this.order ??= readSyncTables(this.db).then(
      (tables) => new Map(tables.map((table, index) => [table.name, index])),
    );
    return this.order;
  }
}

/** "Anna", "Coffee · 12.5 EUR", "2026-09-27". */
function labelOf(row: Record<string, unknown>): string | null {
  const field = LABEL_FIELDS.find((name) => typeof row[name] === 'string' && row[name]);
  const label = field ? String(row[field]) : null;
  if (typeof row['amount'] === 'number' && typeof row['currency'] === 'string') {
    const money = `${row['amount']} ${row['currency']}`;
    return label ? `${label} · ${money}` : money;
  }
  return label;
}

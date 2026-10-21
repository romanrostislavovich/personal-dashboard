import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { Pool } from 'pg';
import { CategoryModelService } from './category-model.service';

/**
 * The category model on a real database: trained on the user's sorted transactions (not on the
 * uncategorized ones), trusted only with enough examples, sure of a new counterparty.
 * Needs PostgreSQL: set TEST_DATABASE_URL like for `sync-store.db.spec.ts`.
 */
const ADMIN_URL = process.env['TEST_DATABASE_URL'];
const MIGRATIONS = join(import.meta.dirname, '../../../../../../../apps/api/migrations');
const DATABASE = 'pd_test_category_model';

describe.skipIf(!ADMIN_URL)('CategoryModelService', { timeout: 60_000 }, () => {
  let admin: Pool;
  let pool: Pool;
  let db: ReturnType<typeof drizzle>;
  const userId = randomUUID();

  const add = (counterparty: string, category: string, amount: number, note = 'Card payment') =>
    db.execute(sql`INSERT INTO finance_transactions
      (user_id, kind, amount, currency, category, note, occurred_on, counterparty)
      VALUES (${userId}, 'expense', ${amount}, 'PLN', ${category}, ${note}, '2026-10-01', ${counterparty})`);

  beforeAll(async () => {
    admin = new Pool({ connectionString: ADMIN_URL });
    await admin.query(`DROP DATABASE IF EXISTS ${DATABASE} WITH (FORCE)`);
    await admin.query(`CREATE DATABASE ${DATABASE}`);
    const url = new URL(ADMIN_URL as string);
    url.pathname = `/${DATABASE}`;
    pool = new Pool({ connectionString: url.toString() });
    pool.on('error', () => undefined);
    db = drizzle({ client: pool, casing: 'snake_case' });
    await migrate(db, { migrationsFolder: MIGRATIONS });
    await db.execute(sql`INSERT INTO users (id, email, password_hash, display_name)
      VALUES (${userId}, 'model@test.local', 'x', 'Test')`);
  });

  afterAll(async () => {
    await pool?.end();
    await admin?.query(`DROP DATABASE IF EXISTS ${DATABASE} WITH (FORCE)`);
    await admin?.end();
  });

  it('is not trusted on a few examples, and learns nothing from the uncategorized', async () => {
    await add('BIEDRONKA 1', 'Groceries', 40);
    await add('ORLEN 1', 'Transport', 200);
    await add('MYSTERY SHOP', 'Uncategorized', 10);
    const state = await new CategoryModelService(db as never).quality(userId);
    const expense = state.kinds.find((kind) => kind.kind === 'expense')!;
    expect(expense.examples).toBe(2);
    expect(expense.trusted).toBe(false);
  });

  it('with a history it sorts a new counterparty on its own', async () => {
    const shops = {
      Groceries: ['BIEDRONKA', 'LIDL', 'ŻABKA', 'CARREFOUR', 'AUCHAN', 'DINO', 'NETTO', 'KAUFLAND'],
      Transport: [
        'ORLEN STACJA',
        'BP STACJA',
        'SHELL STACJA',
        'CIRCLE K STACJA',
        'MOYA STACJA',
        'AMIC STACJA',
      ],
    };
    for (const [category, names] of Object.entries(shops)) {
      for (const name of names) {
        for (let i = 0; i < 6; i++) {
          const note = category === 'Transport' ? 'Zakup paliwa' : 'Zakup przy użyciu karty';
          await add(
            `${name} ${100 + i}`,
            category,
            category === 'Transport' ? 180 + i : 35 + i,
            note,
          );
        }
      }
    }
    const model = new CategoryModelService(db as never);
    const expense = (await model.quality(userId)).kinds.find((kind) => kind.kind === 'expense')!;
    expect(expense.examples).toBeGreaterThanOrEqual(60);
    expect(expense.trusted).toBe(true);
    expect(await model.sure(userId, 'expense', 'POLOMARKET 77 Zakup przy użyciu karty', 30)).toBe(
      'Groceries',
    );
    expect(await model.sure(userId, 'expense', 'LOTOS STACJA 3 Zakup paliwa', 190)).toBe(
      'Transport',
    );
  });
});

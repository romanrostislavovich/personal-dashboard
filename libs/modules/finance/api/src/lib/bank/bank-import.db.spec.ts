import { sql } from 'drizzle-orm';
import { drizzle, NodePgDatabase } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { Pool } from 'pg';
import { configureFieldEncryption } from '@pd/api-core/schema';
import { transactions } from '../finance.schema';
import { TransactionsService } from '../transactions/transactions.service';
import { BankImportService } from './bank-import.service';
import { bankAccounts, bankConnections } from './bank.schema';
import { EnableBankingClient, ProviderTransaction } from './enable-banking.client';

/** Needs PostgreSQL, see `sync-store.db.spec.ts` in api-core for how to run it. */
const ADMIN_URL = process.env['TEST_DATABASE_URL'];
const MIGRATIONS = join(import.meta.dirname, '../../../../../../../apps/api/migrations');
const DB_NAME = `bank_import_test_${process.pid}`;
const OWN_IBAN = 'PL61109010140000071219812874';

const operation = (
  id: string,
  day: string,
  amount: string,
  creditor: string,
  extra: Partial<ProviderTransaction> = {},
): ProviderTransaction => ({
  entry_reference: id,
  transaction_amount: { amount, currency: 'PLN' },
  credit_debit_indicator: 'DBIT',
  status: 'BOOK',
  booking_date: day,
  creditor: { name: creditor },
  ...extra,
});

describe.skipIf(!ADMIN_URL)('BankImportService', () => {
  let admin: Pool;
  let pool: Pool;
  let db: NodePgDatabase;
  let service: BankImportService;
  let userId: string;
  let connectionId: string;
  let accountId: string;

  const bank = {
    balances: async () => [
      { balance_type: 'CLBD', balance_amount: { amount: '1200.00', currency: 'PLN' } },
      { balance_type: 'ITAV', balance_amount: { amount: '1176.51', currency: 'PLN' } },
    ],
    transactions: async () => [
      // The coffee typed by hand a day earlier: the same operation.
      operation('E1', '2026-01-11', '23.49', 'KAWIARNIA 7'),
      // A shop the history knows under another number: its category.
      operation('E2', '2026-01-12', '40.00', 'BIEDRONKA 2 WARSZAWA'),
      // To the user's own savings account: not spent.
      operation('E3', '2026-01-12', '500.00', 'ME', { creditor_account: { iban: OWN_IBAN } }),
      operation('E4', '2026-01-13', '15.00', 'NEW PLACE'),
      // A card payment not booked yet.
      operation('E5', '2026-01-13', '9.99', 'NEW PLACE', { status: 'PDNG' }),
    ],
  } as unknown as EnableBankingClient;

  beforeAll(async () => {
    configureFieldEncryption('a-test-key-that-is-long-enough-0123456789');
    admin = new Pool({ connectionString: ADMIN_URL });
    await admin.query(`DROP DATABASE IF EXISTS ${DB_NAME} WITH (FORCE)`);
    await admin.query(`CREATE DATABASE ${DB_NAME}`);
    const url = new URL(ADMIN_URL as string);
    url.pathname = `/${DB_NAME}`;
    pool = new Pool({ connectionString: url.toString() });
    pool.on('error', () => undefined);
    db = drizzle({ client: pool, casing: 'snake_case' });
    await migrate(db, { migrationsFolder: MIGRATIONS });

    userId = randomUUID();
    await db.execute(sql`INSERT INTO users (id, email, password_hash, display_name, locale)
      VALUES (${userId}, ${`${userId}@test`}, 'hash', 'Test', 'en')`);
    const [connection] = await db
      .insert(bankConnections)
      .values({ userId, bank: 'PKO BP', country: 'PL', sessionId: 's1' })
      .returning();
    connectionId = connection.id;
    const [account] = await db
      .insert(bankAccounts)
      .values({ userId, connectionId, uid: 'a1', iban: 'PL00 1111', enabled: true })
      .returning();
    accountId = account.id;
    await db
      .insert(bankAccounts)
      .values({ userId, connectionId, uid: 'a2', iban: OWN_IBAN, enabled: false });
    await db.insert(transactions).values([
      // Typed by hand.
      {
        userId,
        kind: 'expense',
        amount: 23.49,
        currency: 'PLN',
        category: 'Cafe',
        note: 'coffee',
        occurredOn: '2026-01-10',
      },
      // An earlier operation of the bank, its category corrected by hand.
      {
        userId,
        kind: 'expense',
        amount: 30,
        currency: 'PLN',
        category: 'Groceries',
        occurredOn: '2025-12-20',
        counterparty: 'BIEDRONKA 1 WARSZAWA',
        bankEntryId: 'OLD',
      },
    ]);

    const users = { findById: async () => ({ locale: 'en' }), timeZoneOf: () => 'UTC' };
    const ai = { isConfigured: async () => false, canSee: async () => false };
    const txs = new TransactionsService(db as never, {} as never, {} as never, {} as never);
    service = new BankImportService(db as never, txs, ai as never, users as never);
  }, 60_000);

  afterAll(async () => {
    await pool?.end();
    await admin?.query(`DROP DATABASE IF EXISTS ${DB_NAME} WITH (FORCE)`);
    await admin?.end();
  });

  it('imports the booked operations once, matched, own transfers left out', async () => {
    const [connection] = await db.select().from(bankConnections);
    expect(await service.importConnection(connection, bank)).toEqual({ added: 2, matched: 1 });

    const rows = await db
      .select()
      .from(transactions)
      .where(sql`${transactions.userId} = ${userId}`);
    const byEntry = new Map(rows.map((row) => [row.bankEntryId, row]));
    // The coffee typed by hand keeps its category and note, and is the bank's now.
    expect(byEntry.get('E1')).toMatchObject({
      category: 'Cafe',
      note: 'coffee',
      occurredOn: '2026-01-10',
      bankAccountId: accountId,
    });
    expect(byEntry.get('E2')).toMatchObject({ category: 'Groceries', amount: 40 });
    expect(byEntry.get('E4')).toMatchObject({ category: 'Uncategorized', note: 'NEW PLACE' });
    expect(byEntry.has('E3')).toBe(false);
    expect(byEntry.has('E5')).toBe(false);

    const [account] = await db
      .select()
      .from(bankAccounts)
      .where(sql`${bankAccounts.id} = ${accountId}`);
    expect(account.lastBookedOn).toBe('2026-01-13');
    // What can be spent now, as the bank said it with the import.
    expect(account).toMatchObject({ balance: 1176.51, balanceCurrency: 'PLN' });
    expect(account.balanceAt).toBeInstanceOf(Date);

    // The next import of the same days adds nothing.
    expect(await service.importConnection(connection, bank)).toEqual({ added: 0, matched: 0 });
  });

  it('imports a history exported from iPKO once, its own transfers left out', async () => {
    const csv = [
      '"Data operacji","Data waluty","Typ transakcji","Kwota","Waluta","Saldo po transakcji","Opis transakcji","",""',
      '"2026-02-03","2026-02-03","Płatność kartą","-40,00","PLN","+960,00","Tytuł: 1","Lokalizacja: Adres: BIEDRONKA 9 WARSZAWA Miasto: WARSZAWA",""',
      '"2026-02-04","2026-02-04","Przelew własny","-100,00","PLN","+860,00","Tytuł: savings","",""',
      '"2026-02-05","2026-02-05","Przelew na rachunek","+50,00","PLN","+910,00","Nazwa nadawcy: FRIEND","Tytuł: pizza",""',
    ].join('\n');
    const file = Buffer.from(csv, 'utf8');
    expect(await service.importStatement(userId, file)).toEqual({ added: 2, matched: 0 });
    const rows = await db
      .select()
      .from(transactions)
      .where(sql`${transactions.bankEntryId} LIKE 'pko:%'`);
    expect(
      rows.map((row) => [row.kind, row.amount, row.category, row.bankAccountId]).sort(),
    ).toEqual([
      ['expense', 40, 'Groceries', null],
      ['income', 50, 'Uncategorized', null],
    ]);
    // The same file again (or a longer one over the same days) adds nothing.
    expect(await service.importStatement(userId, file)).toEqual({ added: 0, matched: 0 });
  });

  it('sorts the uncategorized card payments by the shop another one of it is in', async () => {
    const [account] = await db.select().from(bankAccounts);
    await db.insert(transactions).values([
      {
        userId,
        kind: 'expense',
        amount: 12,
        currency: 'PLN',
        category: 'Groceries',
        occurredOn: '2026-03-01',
        note: 'WARSZAWAZABKA Z3766 K.1PL CARD-PAYMENT',
        counterparty: 'WARSZAWAZABKA Z3766 K.1PL',
        bankAccountId: account.id,
        bankEntryId: 'Z1',
      },
      {
        userId,
        kind: 'expense',
        amount: 20,
        currency: 'PLN',
        category: 'Uncategorized',
        occurredOn: '2026-03-02',
        note: 'WARSZAWAZABKA Z7500 K.1PL CARD-PAYMENT',
        bankAccountId: account.id,
        bankEntryId: 'Z2',
      },
      {
        userId,
        kind: 'expense',
        amount: 5,
        currency: 'PLN',
        category: 'Uncategorized',
        occurredOn: '2026-03-02',
        note: 'SOMEWHERE ELSE CARD-PAYMENT',
        bankAccountId: account.id,
        bankEntryId: 'Z3',
      },
    ]);
    // Only the Żabka: the other shop (and the earlier tests' new ones) are unknown, no AI here.
    expect((await service.resort(userId)).sorted).toBe(1);
    const [sorted] = await db
      .select()
      .from(transactions)
      .where(sql`${transactions.bankEntryId} = 'Z2'`);
    expect(sorted).toMatchObject({
      category: 'Groceries',
      counterparty: 'WARSZAWAZABKA Z7500 K.1PL',
    });
  });

  it('refuses a file that is not a history of iPKO', async () => {
    await expect(service.importStatement(userId, Buffer.from('a,b\n1,2'))).rejects.toThrow(/iPKO/);
  });
});

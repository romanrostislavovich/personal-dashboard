import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AppConfig,
  DB,
  Database,
  NotificationsService,
  ServerKeysService,
  UsersService,
} from '@pd/api-core';
import {
  BankAccount,
  BankConnectInput,
  BankConnection,
  BankOption,
  BankState,
  BankSyncResult,
  zonedDateTime,
} from '@pd/contracts';
import { and, asc, eq, isNotNull, lte } from 'drizzle-orm';
import { randomBytes } from 'node:crypto';
import { financeMessages } from '../finance.messages';
import { BankImportService } from './bank-import.service';
import { BankConnectionRow, bankAccounts, bankConnections } from './bank.schema';
import { EnableBankingClient, ProviderAccount } from './enable-banking.client';

const DAY_MS = 24 * 60 * 60 * 1000;
/** What PSD2 lets a consent last: the bank may give less. */
const CONSENT_DAYS = 180;
/** The user has this long to sign in to the bank and come back. */
const STATE_TTL_MS = 15 * 60 * 1000;
/** The reminder to confirm the access again comes this many days before it ends. */
const REMIND_DAYS = 7;

interface Pending {
  userId: string;
  bank: string;
  country: string;
  /** Confirming the access again: the connection whose session is replaced. */
  connectionId?: string;
  expiresAt: number;
}

/**
 * The bank directly (open banking) through Enable Banking. The owner keeps the application's
 * keys (Settings → Integrations); each user connects their bank: the bank's own sign-in page,
 * then back to `/api/finance/bank/callback` with a code that becomes a session. The accounts are
 * chosen on the card; the operations of the chosen ones come in every few hours (see
 * BankImportService). Only the session is kept, encrypted — never the bank's login.
 */
@Injectable()
export class BankService {
  private readonly logger = new Logger(BankService.name);
  // One-time states live in memory, as Spotify's: enough for a single API instance.
  private readonly pending = new Map<string, Pending>();
  private readonly publicUrl: string;

  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(ConfigService) config: AppConfig,
    private readonly keys: ServerKeysService,
    private readonly users: UsersService,
    private readonly notifications: NotificationsService,
    private readonly importer: BankImportService,
  ) {
    this.publicUrl = config.get('PUBLIC_URL', { infer: true }).replace(/\/+$/, '');
  }

  /** Where the bank sends the user back: added to the application at Enable Banking. */
  get redirectUrl(): string {
    return `${this.publicUrl}/api/finance/bank/callback`;
  }

  async state(userId: string): Promise<BankState> {
    const appId = await this.keys.get('finance.enablebanking-app-id');
    const owner = await this.keys.isOwner(userId);
    return {
      available: (await this.client()) !== null,
      app: owner ? { appId: appId ?? '', redirectUrl: this.redirectUrl } : null,
      connections: await this.connections(userId),
    };
  }

  /** The owner's application: kept only when Enable Banking answers to its keys. */
  async setApp(userId: string, appId: string, privateKey: string): Promise<void> {
    await this.keys.assertOwner(userId);
    try {
      await new EnableBankingClient({ appId, privateKey }).application();
    } catch (error) {
      throw new BadRequestException(
        `Enable Banking does not accept this application id and key: ${String(error)}`,
      );
    }
    await this.keys.set('finance.enablebanking-app-id', appId);
    await this.keys.set('finance.enablebanking-key', privateKey);
  }

  async removeApp(userId: string): Promise<void> {
    await this.keys.assertOwner(userId);
    await this.keys.set('finance.enablebanking-app-id', null);
    await this.keys.set('finance.enablebanking-key', null);
  }

  async banks(country: string): Promise<BankOption[]> {
    const client = await this.requireClient();
    return (await client.banks(country))
      .map((bank) => ({ name: bank.name, country: bank.country, logo: bank.logo ?? null }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  /** The bank's sign-in page for the user's consent. */
  async connect(userId: string, input: BankConnectInput): Promise<{ url: string }> {
    const client = await this.requireClient();
    if (input.connectionId) {
      await this.owned(userId, input.connectionId);
    }
    const state = randomBytes(16).toString('hex');
    this.pending.set(state, {
      userId,
      bank: input.bank,
      country: input.country,
      connectionId: input.connectionId,
      expiresAt: Date.now() + STATE_TTL_MS,
    });
    try {
      return await client.startAuthorization({
        bank: input.bank,
        country: input.country,
        redirectUrl: this.redirectUrl,
        state,
        validUntil: new Date(Date.now() + CONSENT_DAYS * DAY_MS),
      });
    } catch (error) {
      this.pending.delete(state);
      throw new BadRequestException(`The bank cannot be connected: ${String(error)}`);
    }
  }

  /**
   * The bank sent the user back: the code becomes a session, its accounts are kept (none
   * enabled yet — the user chooses them on the card). The answer is where the browser goes.
   */
  async handleCallback(code?: string, state?: string, error?: string): Promise<string> {
    const back = (result: string, connectionId?: string) =>
      `${this.publicUrl}/settings?tab=integrations&bank=${result}` +
      (connectionId ? `&connection=${connectionId}` : '');
    const pending = state ? this.pending.get(state) : undefined;
    if (state) {
      this.pending.delete(state);
    }
    const client = await this.client();
    if (!pending || pending.expiresAt < Date.now() || !code || error || !client) {
      return back('error');
    }
    try {
      const session = await client.createSession(code);
      const validUntil = session.access?.valid_until ? new Date(session.access.valid_until) : null;
      const connectionId = pending.connectionId
        ? await this.renew(
            pending.userId,
            pending.connectionId,
            session.session_id,
            validUntil,
            client,
          )
        : await this.create(pending, session.session_id, validUntil);
      await this.saveAccounts(pending.userId, connectionId, session.accounts ?? []);
      return back(pending.connectionId ? 'renewed' : 'connected', connectionId);
    } catch (failure) {
      this.logger.warn(`The bank's session was not made: ${String(failure)}`);
      return back('error');
    }
  }

  /** An account on or off; one switched on is imported at once. */
  async setAccount(userId: string, id: string, enabled: boolean): Promise<void> {
    const [account] = await this.db
      .update(bankAccounts)
      .set({ enabled })
      .where(and(eq(bankAccounts.id, id), eq(bankAccounts.userId, userId)))
      .returning();
    if (!account) {
      throw new NotFoundException('Bank account not found');
    }
    if (enabled) {
      void this.sync(userId, account.connectionId).catch(() => undefined);
    }
  }

  async sync(userId: string, connectionId: string): Promise<BankSyncResult> {
    const connection = await this.owned(userId, connectionId);
    const client = await this.requireClient();
    return this.syncOne(connection, client);
  }

  /** The bank forgets the consent too; the transactions imported stay. */
  async remove(userId: string, connectionId: string): Promise<void> {
    const connection = await this.owned(userId, connectionId);
    const client = await this.client();
    await client?.deleteSession(connection.sessionId).catch(() => undefined);
    await this.db.delete(bankConnections).where(eq(bankConnections.id, connection.id));
  }

  /** The job: every connection still in its consent, one after another. */
  async syncAll(): Promise<void> {
    const client = await this.client();
    if (!client) {
      return;
    }
    const all = await this.db
      .select()
      .from(bankConnections)
      .orderBy(asc(bankConnections.createdAt));
    for (const connection of all.filter((item) => !expired(item))) {
      await this.syncOne(connection, client).catch(() => undefined);
    }
  }

  /** The job: a reminder a week before a consent ends, once per consent. */
  async remindExpiring(): Promise<void> {
    const soon = new Date(Date.now() + REMIND_DAYS * DAY_MS);
    const ending = await this.db
      .select()
      .from(bankConnections)
      .where(and(isNotNull(bankConnections.validUntil), lte(bankConnections.validUntil, soon)));
    for (const connection of ending.filter((item) => !expired(item))) {
      const user = await this.users.findById(connection.userId);
      const timeZone = this.users.timeZoneOf(user);
      const until = zonedDateTime(connection.validUntil as Date, timeZone).date;
      if (connection.remindedFor === until) {
        continue;
      }
      const text = financeMessages(user?.locale ?? 'en');
      await this.notifications.send(connection.userId, {
        title: text.bankExpiringTitle(connection.bank),
        body: text.bankExpiringBody(until, `${this.publicUrl}/settings?tab=integrations`),
        source: 'finance',
      });
      await this.db
        .update(bankConnections)
        .set({ remindedFor: until })
        .where(eq(bankConnections.id, connection.id));
    }
  }

  private async syncOne(
    connection: BankConnectionRow,
    client: EnableBankingClient,
  ): Promise<BankSyncResult> {
    try {
      const result = await this.importer.importConnection(connection, client);
      await this.db
        .update(bankConnections)
        .set({ lastSyncedAt: new Date(), lastError: null })
        .where(eq(bankConnections.id, connection.id));
      return result;
    } catch (error) {
      const message = String(error instanceof Error ? error.message : error).slice(0, 500);
      this.logger.warn(`The bank ${connection.bank} was not read: ${message}`);
      await this.db
        .update(bankConnections)
        .set({ lastError: message })
        .where(eq(bankConnections.id, connection.id));
      throw new ServiceUnavailableException(`The bank was not read: ${message}`);
    }
  }

  private async create(pending: Pending, sessionId: string, validUntil: Date | null) {
    const [row] = await this.db
      .insert(bankConnections)
      .values({
        userId: pending.userId,
        bank: pending.bank,
        country: pending.country,
        sessionId,
        validUntil,
      })
      .returning({ id: bankConnections.id });
    return row.id;
  }

  /** The access confirmed again: the new session in place of the old one, the accounts kept. */
  private async renew(
    userId: string,
    connectionId: string,
    sessionId: string,
    validUntil: Date | null,
    client: EnableBankingClient,
  ) {
    const connection = await this.owned(userId, connectionId);
    await client.deleteSession(connection.sessionId).catch(() => undefined);
    await this.db
      .update(bankConnections)
      .set({ sessionId, validUntil, remindedFor: null, lastError: null })
      .where(eq(bankConnections.id, connectionId));
    return connectionId;
  }

  /**
   * The accounts of a new session: an account known by its IBAN keeps its choice and the day
   * it was imported to (its id in the new session changes); a new one comes switched off.
   */
  private async saveAccounts(userId: string, connectionId: string, accounts: ProviderAccount[]) {
    const known = await this.db
      .select()
      .from(bankAccounts)
      .where(eq(bankAccounts.connectionId, connectionId));
    for (const account of accounts) {
      const iban = account.account_id?.iban ?? null;
      const same = known.find((row) => iban && row.iban === iban);
      const fields = {
        uid: account.uid,
        iban,
        name: account.name ?? null,
        currency: account.currency ?? null,
      };
      if (same) {
        await this.db.update(bankAccounts).set(fields).where(eq(bankAccounts.id, same.id));
      } else {
        await this.db.insert(bankAccounts).values({ userId, connectionId, ...fields });
      }
    }
  }

  private async connections(userId: string): Promise<BankConnection[]> {
    const rows = await this.db
      .select()
      .from(bankConnections)
      .where(eq(bankConnections.userId, userId))
      .orderBy(asc(bankConnections.createdAt));
    const accounts = await this.db
      .select()
      .from(bankAccounts)
      .where(eq(bankAccounts.userId, userId))
      .orderBy(asc(bankAccounts.createdAt));
    return rows.map((row) => ({
      id: row.id,
      bank: row.bank,
      country: row.country,
      validUntil: row.validUntil?.toISOString() ?? null,
      expired: expired(row),
      lastSyncedAt: row.lastSyncedAt?.toISOString() ?? null,
      lastError: row.lastError,
      accounts: accounts
        .filter((account) => account.connectionId === row.id)
        .map((account): BankAccount => ({
          id: account.id,
          name: account.name,
          ibanEnd: account.iban ? account.iban.replace(/\s+/g, '').slice(-4) : null,
          currency: account.currency,
          enabled: account.enabled,
          lastSyncedAt: account.lastSyncedAt?.toISOString() ?? null,
        })),
    }));
  }

  private async owned(userId: string, id: string): Promise<BankConnectionRow> {
    const [row] = await this.db
      .select()
      .from(bankConnections)
      .where(and(eq(bankConnections.id, id), eq(bankConnections.userId, userId)));
    if (!row) {
      throw new NotFoundException('Bank connection not found');
    }
    return row;
  }

  private async client(): Promise<EnableBankingClient | null> {
    const appId = await this.keys.get('finance.enablebanking-app-id');
    const privateKey = await this.keys.get('finance.enablebanking-key');
    return appId && privateKey ? new EnableBankingClient({ appId, privateKey }) : null;
  }

  private async requireClient(): Promise<EnableBankingClient> {
    const client = await this.client();
    if (!client) {
      throw new ServiceUnavailableException('Open banking is not set up on this server');
    }
    return client;
  }
}

function expired(connection: BankConnectionRow): boolean {
  return !!connection.validUntil && connection.validUntil.getTime() < Date.now();
}

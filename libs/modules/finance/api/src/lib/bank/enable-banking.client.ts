import { createSign } from 'node:crypto';

/*
 * Enable Banking's API (https://enablebanking.com/docs/api/reference/): every request carries
 * a JWT signed with the private key of the owner's application (RS256, `kid` — the application's
 * id). Only what Finance needs: the banks of a country, the user's consent (a redirect to the
 * bank and back), the session with its accounts, and the transactions of an account.
 */

const ORIGIN = 'https://api.enablebanking.com';
/** A token lives an hour; the API allows a day at most. */
const TOKEN_SECONDS = 3600;
/** A bank may answer slowly; longer than this, and the import tries again next time. */
const TIMEOUT_MS = 30_000;

export interface EnableBankingKeys {
  appId: string;
  privateKey: string;
}

/** A transaction as the API gives it (ISO 20022 names); only the fields Finance reads. */
export interface ProviderTransaction {
  entry_reference?: string | null;
  transaction_id?: string | null;
  transaction_amount: { amount: string; currency: string };
  credit_debit_indicator: 'CRDT' | 'DBIT';
  status?: string | null;
  booking_date?: string | null;
  value_date?: string | null;
  transaction_date?: string | null;
  creditor?: { name?: string | null } | null;
  debtor?: { name?: string | null } | null;
  creditor_account?: { iban?: string | null } | null;
  debtor_account?: { iban?: string | null } | null;
  remittance_information?: string[] | null;
}

export interface ProviderBank {
  name: string;
  country: string;
  logo?: string;
  /** The longest consent the bank gives, in seconds: a longer one is refused. */
  maximum_consent_validity?: number | null;
}

export interface ProviderBalance {
  balance_amount: { amount: string; currency: string };
  balance_type?: string | null;
  reference_date?: string | null;
}

export interface ProviderAccount {
  uid: string;
  account_id?: { iban?: string | null } | null;
  name?: string | null;
  currency?: string | null;
}

export class EnableBankingError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export class EnableBankingClient {
  constructor(private readonly keys: EnableBankingKeys) {}

  /** The application itself: answers only when the id and the key are right. */
  application(): Promise<{ name?: string; redirect_urls?: string[] }> {
    return this.request('GET', '/application');
  }

  async banks(country: string): Promise<ProviderBank[]> {
    const answer = await this.request<{ aspsps: ProviderBank[] }>(
      'GET',
      `/aspsps?country=${encodeURIComponent(country)}&psu_type=personal`,
    );
    return answer.aspsps ?? [];
  }

  /** The bank's sign-in page for the user's consent, good until `validUntil`. */
  startAuthorization(input: {
    bank: string;
    country: string;
    redirectUrl: string;
    state: string;
    validUntil: Date;
  }): Promise<{ url: string }> {
    return this.request('POST', '/auth', {
      access: { valid_until: input.validUntil.toISOString() },
      aspsp: { name: input.bank, country: input.country },
      state: input.state,
      redirect_url: input.redirectUrl,
      psu_type: 'personal',
    });
  }

  /** The code the bank sent the user back with becomes a session with the accounts. */
  createSession(code: string): Promise<{
    session_id: string;
    accounts: ProviderAccount[];
    access?: { valid_until?: string };
  }> {
    return this.request('POST', '/sessions', { code });
  }

  async deleteSession(sessionId: string): Promise<void> {
    await this.request('DELETE', `/sessions/${encodeURIComponent(sessionId)}`);
  }

  /** The balances of an account, by type (ISO 20022: `ITAV` — available now, `CLBD` — booked…). */
  async balances(accountUid: string): Promise<ProviderBalance[]> {
    const answer = await this.request<{ balances?: ProviderBalance[] }>(
      'GET',
      `/accounts/${encodeURIComponent(accountUid)}/balances`,
    );
    return answer.balances ?? [];
  }

  /** Every page of the booked transactions of an account since a day. */
  async transactions(accountUid: string, dateFrom: string): Promise<ProviderTransaction[]> {
    const all: ProviderTransaction[] = [];
    let continuation: string | undefined;
    // A guard: a bank that keeps giving pages is not followed for ever.
    for (let page = 0; page < 50; page++) {
      const query = new URLSearchParams({ date_from: dateFrom, transaction_status: 'BOOK' });
      if (continuation) {
        query.set('continuation_key', continuation);
      }
      const answer = await this.request<{
        transactions?: ProviderTransaction[];
        continuation_key?: string | null;
      }>('GET', `/accounts/${encodeURIComponent(accountUid)}/transactions?${query}`);
      all.push(...(answer.transactions ?? []));
      continuation = answer.continuation_key ?? undefined;
      if (!continuation) {
        break;
      }
    }
    return all;
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const response = await fetch(`${ORIGIN}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.token()}`,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const text = await response.text();
    if (!response.ok) {
      throw new EnableBankingError(response.status, errorMessage(response.status, text));
    }
    return (text ? JSON.parse(text) : {}) as T;
  }

  private token(): string {
    return signToken(this.keys, Math.floor(Date.now() / 1000));
  }
}

/** The JWT of a request: `kid` — the application, signed with its private key. */
export function signToken(keys: EnableBankingKeys, now: number): string {
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const header = encode({ typ: 'JWT', alg: 'RS256', kid: keys.appId });
  const body = encode({
    iss: 'enablebanking.com',
    aud: 'api.enablebanking.com',
    iat: now,
    exp: now + TOKEN_SECONDS,
  });
  const signature = createSign('RSA-SHA256')
    .update(`${header}.${body}`)
    .sign(keys.privateKey)
    .toString('base64url');
  return `${header}.${body}.${signature}`;
}

/** The provider's own words when it gives them (`message`, `detail`), the status otherwise. */
function errorMessage(status: number, text: string): string {
  try {
    const parsed = JSON.parse(text) as { message?: string; detail?: unknown; error?: string };
    const detail = typeof parsed.detail === 'string' ? parsed.detail : undefined;
    return [parsed.message ?? parsed.error, detail].filter(Boolean).join(': ') || `HTTP ${status}`;
  } catch {
    return `HTTP ${status}`;
  }
}

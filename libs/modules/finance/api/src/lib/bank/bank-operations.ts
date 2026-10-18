import { createHash } from 'node:crypto';
import { TransactionKind } from '@pd/contracts';
import { ProviderTransaction } from './enable-banking.client';

/** A booked operation of a bank account as Finance takes it. */
export interface BankOperation {
  /** The bank's id of the operation, or a fingerprint of it when the bank gives none. */
  entryId: string;
  kind: TransactionKind;
  amount: number;
  currency: string;
  bookedOn: string;
  /** Who was paid (an expense) or who paid (an income). */
  counterparty: string | null;
  counterpartyIban: string | null;
  /** The payment's title, as the bank wrote it. */
  note: string | null;
}

const NOTE_MAX = 500;

/**
 * The operations of a page of the provider: booked ones only (a pending card payment changes
 * before it is booked), each with an id that stays the same on every import — the bank's own,
 * or a fingerprint; two equal operations of one day (two coffees) are told apart by their order.
 */
export function operationsOf(transactions: ProviderTransaction[]): BankOperation[] {
  const seen = new Map<string, number>();
  const operations: BankOperation[] = [];
  for (const transaction of transactions) {
    const operation = operationOf(transaction);
    if (!operation) {
      continue;
    }
    const times = seen.get(operation.entryId) ?? 0;
    seen.set(operation.entryId, times + 1);
    operations.push(times ? { ...operation, entryId: `${operation.entryId}#${times}` } : operation);
  }
  return operations;
}

export function operationOf(transaction: ProviderTransaction): BankOperation | null {
  if (transaction.status && transaction.status !== 'BOOK') {
    return null;
  }
  const bookedOn =
    transaction.booking_date ?? transaction.value_date ?? transaction.transaction_date ?? null;
  const amount = Math.abs(Number(transaction.transaction_amount?.amount));
  const currency = transaction.transaction_amount?.currency?.toUpperCase();
  if (!bookedOn || !currency || !Number.isFinite(amount) || amount === 0) {
    return null;
  }
  const kind: TransactionKind =
    transaction.credit_debit_indicator === 'CRDT' ? 'income' : 'expense';
  const { counterparty, counterpartyIban } = partyOf(transaction, kind);
  const note =
    clean((transaction.remittance_information ?? []).join(' ')).slice(0, NOTE_MAX) || null;
  const operation = { kind, amount: Math.round(amount * 100) / 100, currency, bookedOn };
  return {
    entryId: entryIdOf(transaction, { ...operation, counterparty, note }),
    ...operation,
    counterparty,
    counterpartyIban,
    note,
  };
}

/** The other side: who was paid for an expense, who paid for an income. */
function partyOf(transaction: ProviderTransaction, kind: TransactionKind) {
  const party = kind === 'expense' ? transaction.creditor : transaction.debtor;
  const account = kind === 'expense' ? transaction.creditor_account : transaction.debtor_account;
  return {
    counterparty: clean(party?.name) || null,
    counterpartyIban: normalizeIban(account?.iban),
  };
}

/** The bank's own id of the operation, or a fingerprint of what it is. */
function entryIdOf(
  transaction: ProviderTransaction,
  fields: Omit<BankOperation, 'entryId' | 'counterpartyIban'>,
): string {
  const bankId = transaction.entry_reference || transaction.transaction_id;
  if (bankId) {
    return bankId;
  }
  const { bookedOn, kind, amount, currency, counterparty, note } = fields;
  const hash = createHash('sha256')
    .update([bookedOn, kind, amount.toFixed(2), currency, counterparty, note].join('|'))
    .digest('hex');
  return `h:${hash.slice(0, 32)}`;
}

/** A transfer between the user's own accounts: neither spent nor earned. */
export function isOwnTransfer(operation: BankOperation, ownIbans: Set<string>): boolean {
  return !!operation.counterpartyIban && ownIbans.has(operation.counterpartyIban);
}

export function normalizeIban(iban: string | null | undefined): string | null {
  const value = (iban ?? '').replace(/\s+/g, '').toUpperCase();
  return value || null;
}

/**
 * The counterparty as a rule of categories knows it: "BIEDRONKA 1234 WARSZAWA" and "Biedronka
 * 5678 Warszawa" are one shop — lower case, no digits or signs, the first two words.
 */
export function counterpartyKey(name: string | null): string | null {
  const words = (name ?? '')
    .toLowerCase()
    .replace(/[^\p{L}\s]+/gu, ' ')
    .split(/\s+/)
    .filter((word) => word.length > 1);
  return words.length ? words.slice(0, 2).join(' ') : null;
}

export interface MatchCandidate {
  id: string;
  kind: TransactionKind;
  amount: number;
  currency: string;
  occurredOn: string;
}

/**
 * A transaction typed by hand (or from a statement) that is this operation: the same kind,
 * amount and currency, a day apart at most — the nearest day first. `null` — none.
 */
export function matchOf(
  operation: BankOperation,
  candidates: MatchCandidate[],
): MatchCandidate | null {
  const day = (value: string) => Date.parse(`${value}T00:00:00Z`) / 86_400_000;
  let best: MatchCandidate | null = null;
  let bestDistance = Infinity;
  for (const candidate of candidates) {
    const distance = Math.abs(day(candidate.occurredOn) - day(operation.bookedOn));
    if (
      candidate.kind === operation.kind &&
      candidate.currency === operation.currency &&
      Math.abs(candidate.amount - operation.amount) < 0.005 &&
      distance <= 1 &&
      distance < bestDistance
    ) {
      best = candidate;
      bestDistance = distance;
    }
  }
  return best;
}

function clean(value: string | null | undefined): string {
  return (value ?? '').replace(/\s+/g, ' ').trim();
}

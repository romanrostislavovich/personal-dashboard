import { z } from 'zod';

/*
 * The bank directly (open banking, PSD2) through Enable Banking: the owner registers an
 * application of their own there (own accounts only, no licence), each user connects their
 * bank with the bank's own sign-in, and the operations come in as transactions every few hours.
 */

/** The owner's application at Enable Banking: its id and its private key (PEM). */
export const bankAppInputSchema = z.object({
  appId: z.uuid(),
  privateKey: z
    .string()
    .trim()
    .max(20_000)
    .refine((key) => /-----BEGIN (RSA )?PRIVATE KEY-----/.test(key), 'Expected a PEM private key'),
});
export type BankAppInput = z.infer<typeof bankAppInputSchema>;

export interface BankAppState {
  appId: string;
  /** Where the bank sends the user back: add it to the application at Enable Banking. */
  redirectUrl: string;
}

/** A bank the provider can connect to. */
export interface BankOption {
  name: string;
  country: string;
  logo: string | null;
}

export interface BankAccount {
  id: string;
  name: string | null;
  /** The last four characters only: enough to tell the accounts apart. */
  ibanEnd: string | null;
  currency: string | null;
  enabled: boolean;
  lastSyncedAt: string | null;
}

export interface BankConnection {
  id: string;
  bank: string;
  country: string;
  /** The access the user gave ends here; then it is confirmed again in the bank. */
  validUntil: string | null;
  expired: boolean;
  lastSyncedAt: string | null;
  lastError: string | null;
  accounts: BankAccount[];
}

export interface BankState {
  /** The server has the application's keys. */
  available: boolean;
  /** For the owner only. */
  app: BankAppState | null;
  connections: BankConnection[];
}

export const bankConnectInputSchema = z.object({
  country: z
    .string()
    .trim()
    .length(2)
    .transform((value) => value.toUpperCase()),
  bank: z.string().trim().min(1).max(200),
  /** Confirming the access again: the connection whose session it replaces. */
  connectionId: z.uuid().optional(),
});
export type BankConnectInput = z.infer<typeof bankConnectInputSchema>;

export const bankBanksQuerySchema = z.object({
  country: z
    .string()
    .trim()
    .length(2)
    .transform((value) => value.toUpperCase()),
});

export const bankAccountUpdateSchema = z.object({ enabled: z.boolean() });
export type BankAccountUpdate = z.infer<typeof bankAccountUpdateSchema>;

export interface BankSyncResult {
  /** New transactions, and the ones already there (typed by hand) that the bank's matched. */
  added: number;
  matched: number;
}

export interface BankResortResult {
  /** Bank transactions that got a category now, and the ones still without one. */
  sorted: number;
  left: number;
}

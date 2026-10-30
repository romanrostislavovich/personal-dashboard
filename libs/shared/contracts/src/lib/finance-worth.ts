import {z} from 'zod';
import {LocalDate} from './local-date';

/*
 * Net worth and runway: what one has (the bank accounts by themselves, the rest typed in by
 * hand), how much a month goes, and for how many months the money at hand would last.
 */

export const ASSET_KINDS = [
  'cash',
  'account',
  'deposit',
  'investment',
  'property',
  'debt',
] as const;
export type AssetKind = (typeof ASSET_KINDS)[number];

/** Kinds that are money at hand unless said otherwise: they count for the runway. */
export const LIQUID_ASSET_KINDS: readonly AssetKind[] = [
  'cash',
  'account',
  'deposit',
];

export const assetInputSchema = z.object({
  name: z.string().trim().min(1).max(100),
  kind: z.enum(ASSET_KINDS),
  /** What it is worth now; a debt is written as a positive sum and counted against. */
  amount: z.number().min(0).max(1_000_000_000_000),
  currency: z.string().trim().length(3).toUpperCase(),
  /** Counts for the runway (can be spent within days). */
  liquid: z.boolean(),
});
export type AssetInput = z.infer<typeof assetInputSchema>;

/** Something one owns or owes, typed in by hand. */
export interface Asset {
  id: string;
  name: string;
  kind: AssetKind;
  amount: number;
  currency: string;
  liquid: boolean;
  updatedAt: string;
}

/** One line of the net worth: a bank account or an asset of one's own. */
export interface WorthItem {
  source: 'bank' | 'manual';
  /** The asset's or the bank account's id. */
  id: string;
  name: string;
  kind: AssetKind;
  amount: number;
  currency: string;
  /** In the main currency, a debt negative; `null` — no rate. */
  inMain: number | null;
  liquid: boolean;
  /** When the value was last known. */
  at: string | null;
}

export interface WorthPoint {
  day: LocalDate;
  total: number;
}

export interface NetWorth {
  currency: string;
  /** Everything owned minus the debts, in the main currency. */
  total: number;
  /** The money at hand: what counts for the runway. */
  liquid: number;
  items: WorthItem[];
  /** Currencies with no rate: their items are left out of the totals. */
  missing: string[];
  /** The total a day, the oldest first (up to a year). */
  history: WorthPoint[];
  /** The total 30 days ago, to show the change; `null` — no point that old. */
  monthAgo: number | null;
  /** The average personal expenses of a month over the last full months. */
  burnPerMonth: number;
  /** How many full months the average is over (up to 3); 0 — the last 30 days instead. */
  burnMonths: number;
  /** How many months the money at hand lasts at that rate; `null` — nothing spent yet. */
  runwayMonths: number | null;
}

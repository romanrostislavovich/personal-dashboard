import { CostProvider } from '@pd/contracts';

/**
 * What the provider learned about costs during a sync:
 * - `monthTotal` — the full amount for the current month (replaces the previous value), as with Hetzner;
 * - `increment` — how much was spent since the last sync (added up), as with DeepSeek.
 */
export type CostMeasurement =
  | { kind: 'monthTotal'; amount: number; currency: string }
  | { kind: 'increment'; amount: number; currency: string; state: Record<string, unknown> };

/**
 * Adapter for an external service. To add a new one (DigitalOcean, OpenAI…),
 * implement the interface, register the class in FinanceModule and add the id to COST_PROVIDERS.
 */
export interface CostProviderAdapter {
  readonly id: CostProvider;
  /** Checks the token on connect; throws CostProviderAuthError if it is not valid. */
  verify(token: string): Promise<void>;
  measure(token: string, state: Record<string, unknown>): Promise<CostMeasurement>;
}

export class CostProviderAuthError extends Error {}

export function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

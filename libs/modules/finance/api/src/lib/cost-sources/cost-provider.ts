import { CostProvider } from '@pd/contracts';

/**
 * Что провайдер узнал о затратах при синхронизации:
 * - `monthTotal` — полная сумма за текущий месяц (заменяет прежнее значение), как у Hetzner;
 * - `increment` — сколько потрачено с прошлой синхронизации (прибавляется), как у DeepSeek.
 */
export type CostMeasurement =
  | { kind: 'monthTotal'; amount: number; currency: string }
  | { kind: 'increment'; amount: number; currency: string; state: Record<string, unknown> };

/**
 * Адаптер внешнего сервиса. Чтобы добавить новый (DigitalOcean, OpenAI…),
 * реализуй интерфейс, зарегистрируй класс в FinanceModule и добавь id в COST_PROVIDERS.
 */
export interface CostProviderAdapter {
  readonly id: CostProvider;
  /** Проверяет токен при подключении; бросает CostProviderAuthError, если он не подходит. */
  verify(token: string): Promise<void>;
  measure(token: string, state: Record<string, unknown>): Promise<CostMeasurement>;
}

export class CostProviderAuthError extends Error {}

export function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

import { roundMoney } from '../cost-provider';

export interface DeepseekBalanceInfo {
  currency: string;
  /** Строкой, например `"110.00"`. */
  total_balance: string;
}

/** Выбираем баланс в USD, если он есть (аккаунт может иметь и CNY). */
export function pickBalance(infos: DeepseekBalanceInfo[]): { currency: string; balance: number } {
  const info = infos.find((i) => i.currency === 'USD') ?? infos[0];
  if (!info) {
    throw new Error('DeepSeek returned no balance');
  }
  return { currency: info.currency, balance: Number(info.total_balance) };
}

/**
 * Расход между двумя замерами баланса.
 * Рост баланса — это пополнение, а не расход (0). Если между замерами было и пополнение,
 * и расход, расход будет занижен — поэтому синхронизация идёт каждый день.
 */
export function consumptionBetween(previous: number | null, current: number): number {
  if (previous === null || current >= previous) {
    return 0;
  }
  return roundMoney(previous - current);
}

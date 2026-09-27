import { roundMoney } from '../cost-provider';

export interface DeepseekBalanceInfo {
  currency: string;
  /** As a string, for example `"110.00"`. */
  total_balance: string;
}

/** Pick the USD balance if there is one (an account may also have CNY). */
export function pickBalance(infos: DeepseekBalanceInfo[]): { currency: string; balance: number } {
  const info = infos.find((i) => i.currency === 'USD') ?? infos[0];
  if (!info) {
    throw new Error('DeepSeek returned no balance');
  }
  return { currency: info.currency, balance: Number(info.total_balance) };
}

/**
 * Spending between two balance readings.
 * A balance increase is a top-up, not spending (0). If there was both a top-up and spending
 * between readings, spending is underestimated — that is why the sync runs daily.
 */
export function consumptionBetween(previous: number | null, current: number): number {
  if (previous === null || current >= previous) {
    return 0;
  }
  return roundMoney(previous - current);
}

import { Injectable } from '@nestjs/common';
import { CostMeasurement, CostProviderAdapter, CostProviderAuthError } from '../cost-provider';
import { consumptionBetween, DeepseekBalanceInfo, pickBalance } from './deepseek-balance';

/**
 * DeepSeek. У API нет истории расходов — только текущий баланс (GET /user/balance),
 * поэтому расход считаем по его уменьшению между синхронизациями.
 * Токен: platform.deepseek.com → API keys.
 */
@Injectable()
export class DeepseekCostProvider implements CostProviderAdapter {
  readonly id = 'deepseek' as const;

  async verify(token: string): Promise<void> {
    await this.fetchBalance(token);
  }

  async measure(token: string, state: Record<string, unknown>): Promise<CostMeasurement> {
    const { currency, balance } = pickBalance(await this.fetchBalance(token));
    const previous = typeof state['lastBalance'] === 'number' ? state['lastBalance'] : null;
    return {
      kind: 'increment',
      // При смене валюты аккаунта начинаем отсчёт заново.
      amount: state['currency'] === currency ? consumptionBetween(previous, balance) : 0,
      currency,
      state: { lastBalance: balance, currency },
    };
  }

  private async fetchBalance(token: string): Promise<DeepseekBalanceInfo[]> {
    const response = await fetch('https://api.deepseek.com/user/balance', {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    });
    if (response.status === 401) {
      throw new CostProviderAuthError('DeepSeek API key is invalid');
    }
    if (!response.ok) {
      throw new Error(`DeepSeek API ${response.status}`);
    }
    return ((await response.json()) as { balance_infos: DeepseekBalanceInfo[] }).balance_infos;
  }
}

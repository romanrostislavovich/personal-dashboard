import { Injectable } from '@nestjs/common';
import { CostMeasurement, CostProviderAdapter, CostProviderAuthError } from '../cost-provider';
import {
  estimateHetznerMonthlyCost,
  HetznerPricing,
  HetznerPrimaryIp,
  HetznerServer,
  HetznerVolume,
} from './hetzner-cost';

const API = 'https://api.hetzner.cloud/v1';

/**
 * Hetzner Cloud. The API does not return invoices, so we compute the monthly cost
 * of the current resources from the official price list (the /pricing endpoint).
 * Token: Hetzner Console → project → Security → API tokens (Read is enough).
 */
@Injectable()
export class HetznerCostProvider implements CostProviderAdapter {
  readonly id = 'hetzner' as const;

  async verify(token: string): Promise<void> {
    await this.get(token, '/pricing');
  }

  async measure(token: string): Promise<CostMeasurement> {
    const [pricing, servers, primaryIps, volumes] = await Promise.all([
      this.get<{ pricing: HetznerPricing }>(token, '/pricing'),
      this.getAll<HetznerServer>(token, '/servers', 'servers'),
      this.getAll<HetznerPrimaryIp>(token, '/primary_ips', 'primary_ips'),
      this.getAll<HetznerVolume>(token, '/volumes', 'volumes'),
    ]);
    const estimate = estimateHetznerMonthlyCost({
      pricing: pricing.pricing,
      servers,
      primaryIps,
      volumes,
    });
    return { kind: 'monthTotal', amount: estimate.total, currency: estimate.currency };
  }

  /** Hetzner API lists are paginated; one page of 50 is enough for a small project. */
  private async getAll<T>(token: string, path: string, key: string): Promise<T[]> {
    const response = await this.get<Record<string, T[]>>(token, `${path}?per_page=50`);
    return response[key] ?? [];
  }

  private async get<T>(token: string, path: string): Promise<T> {
    const response = await fetch(API + path, { headers: { Authorization: `Bearer ${token}` } });
    if (response.status === 401) {
      throw new CostProviderAuthError('Hetzner token is invalid');
    }
    if (!response.ok) {
      throw new Error(`Hetzner API ${response.status}: ${path}`);
    }
    return (await response.json()) as T;
  }
}

import { roundMoney } from '../cost-provider';

// Минимальные типы ответов Hetzner Cloud API (https://docs.hetzner.cloud) — только нужные поля.

interface HetznerPrice {
  /** Цена строкой, например `"4.5100000000"`. */
  net: string;
  gross: string;
}

interface LocationPrice {
  location: string;
  price_monthly: HetznerPrice;
}

export interface HetznerPricing {
  currency: string;
  server_backup: { percentage: string };
  primary_ips: { type: string; prices: LocationPrice[] }[];
  volume: { price_per_gb_month: HetznerPrice };
}

export interface HetznerServer {
  name: string;
  server_type: { name: string; prices: LocationPrice[] };
  location: { name: string };
  /** Не null, если включены бэкапы. */
  backup_window: string | null;
}

export interface HetznerPrimaryIp {
  type: string;
  location: { name: string };
}

export interface HetznerVolume {
  name: string;
  size: number;
  location: { name: string };
}

export interface HetznerCostEstimate {
  currency: string;
  total: number;
  items: { label: string; amount: number }[];
}

/**
 * Месячная стоимость текущих ресурсов проекта Hetzner Cloud (цены с НДС).
 * Hetzner берёт почасовую оплату, но не больше месячной цены — поэтому для ресурсов,
 * которые работают весь месяц, месячная цена и есть итоговая сумма.
 */
export function estimateHetznerMonthlyCost(input: {
  pricing: HetznerPricing;
  servers: HetznerServer[];
  primaryIps: HetznerPrimaryIp[];
  volumes: HetznerVolume[];
}): HetznerCostEstimate {
  const { pricing } = input;
  const backupFactor = Number(pricing.server_backup.percentage) / 100;
  const items: HetznerCostEstimate['items'] = [];

  for (const server of input.servers) {
    const price = monthlyPrice(server.server_type.prices, server.location.name);
    items.push({ label: `${server.name} (${server.server_type.name})`, amount: price });
    if (server.backup_window) {
      items.push({ label: `${server.name}: backups`, amount: price * backupFactor });
    }
  }

  for (const ip of input.primaryIps) {
    const prices = pricing.primary_ips.find((p) => p.type === ip.type)?.prices ?? [];
    items.push({ label: `Primary ${ip.type}`, amount: monthlyPrice(prices, ip.location.name) });
  }

  const perGb = Number(pricing.volume.price_per_gb_month.gross);
  for (const volume of input.volumes) {
    items.push({ label: `Volume ${volume.name} (${volume.size} GB)`, amount: volume.size * perGb });
  }

  const rounded = items.map((item) => ({ ...item, amount: roundMoney(item.amount) }));
  return {
    currency: pricing.currency,
    total: roundMoney(rounded.reduce((sum, item) => sum + item.amount, 0)),
    items: rounded.filter((item) => item.amount > 0),
  };
}

function monthlyPrice(prices: LocationPrice[], location: string): number {
  const price = prices.find((p) => p.location === location);
  return price ? Number(price.price_monthly.gross) : 0;
}

import { estimateHetznerMonthlyCost, HetznerPricing } from './hetzner-cost';

const price = (location: string, gross: string) => ({
  location,
  price_monthly: { net: '0', gross },
});

const pricing: HetznerPricing = {
  currency: 'EUR',
  server_backup: { percentage: '20.0000000000' },
  primary_ips: [
    { type: 'ipv4', prices: [price('fsn1', '0.6000000000'), price('nbg1', '0.6000000000')] },
    { type: 'ipv6', prices: [price('fsn1', '0.0000000000')] },
  ],
  volume: { price_per_gb_month: { net: '0', gross: '0.0520000000' } },
};

const cx22 = {
  name: 'cx22',
  prices: [price('fsn1', '4.5100000000'), price('hel1', '4.9900000000')],
};

describe('estimateHetznerMonthlyCost', () => {
  it('sums servers by their location price, backups, IPv4 and volumes', () => {
    const estimate = estimateHetznerMonthlyCost({
      pricing,
      servers: [
        { name: 'web', server_type: cx22, location: { name: 'fsn1' }, backup_window: '22-02' },
        { name: 'worker', server_type: cx22, location: { name: 'hel1' }, backup_window: null },
      ],
      primaryIps: [
        { type: 'ipv4', location: { name: 'fsn1' } },
        { type: 'ipv6', location: { name: 'fsn1' } },
      ],
      volumes: [{ name: 'data', size: 10, location: { name: 'fsn1' } }],
    });

    // 4.51 + 0.90 (backups) + 4.99 + 0.60 + 0.52 = 11.52
    expect(estimate.total).toBe(11.52);
    expect(estimate.currency).toBe('EUR');
    // Бесплатный IPv6 не показываем отдельной строкой.
    expect(estimate.items.map((item) => item.label)).toEqual([
      'web (cx22)',
      'web: backups',
      'worker (cx22)',
      'Primary ipv4',
      'Volume data (10 GB)',
    ]);
  });

  it('returns zero for an empty project', () => {
    const estimate = estimateHetznerMonthlyCost({
      pricing,
      servers: [],
      primaryIps: [],
      volumes: [],
    });
    expect(estimate).toEqual({ currency: 'EUR', total: 0, items: [] });
  });
});

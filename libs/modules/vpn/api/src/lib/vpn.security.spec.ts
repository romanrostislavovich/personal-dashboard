import {vpnMessages} from './vpn.messages';
import {VpnFacts, vpnProblems} from './vpn.security';

const now = new Date('2026-11-03T12:00:00Z');
const hoursAgo = (hours: number) =>
  new Date(now.getTime() - hours * 3_600_000).toISOString();
const text = vpnMessages('en').finding;

const phone = (networks: {network: string; firstSeenAt: string}[]) => ({
  name: 'Phone',
  kind: 'phone',
  createdAt: hoursAgo(24 * 10),
  firstConnectedAt: hoursAgo(24 * 10),
  lastHandshakeAt: hoursAgo(1),
  networks: networks.map(network => ({...network, address: '1.2.3.4'})),
});

const facts = (devices: VpnFacts['devices'], statusAt = hoursAgo(0)) => ({
  host: 'vpn.example.com',
  port: 37853,
  statusAt,
  devices,
});

describe('vpnProblems', () => {
  it('a network new in the last day is a finding; the first one is not', () => {
    const keys = vpnProblems(
      facts([
        phone([
          {network: '93.84.0.0/16', firstSeenAt: hoursAgo(24 * 10)},
          {network: '185.1.0.0/16', firstSeenAt: hoursAgo(2)},
          {network: '46.53.0.0/16', firstSeenAt: hoursAgo(30)},
        ]),
      ]),
      text,
      now,
    ).map(problem => problem.key);
    expect(keys).toEqual(['vpn.Phone.network.185.1.0.0/16']);
  });

  it('a silent container with devices, and a device idle for 60 days', () => {
    const idle = {...phone([]), lastHandshakeAt: hoursAgo(24 * 61)};
    const problems = vpnProblems(facts([idle], hoursAgo(1)), text, now);
    expect(problems.map(problem => [problem.key, problem.severity])).toEqual([
      ['vpn.down', 'medium'],
      ['vpn.Phone.idle', 'low'],
    ]);
  });

  it('nothing to say about a quiet, healthy VPN', () => {
    expect(vpnProblems(facts([phone([])]), text, now)).toEqual([]);
  });
});

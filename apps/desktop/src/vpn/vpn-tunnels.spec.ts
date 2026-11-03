import {describe, expect, it} from 'vitest';
import {
  parseServiceStatus,
  parseSid,
  removeScript,
  runningTunnels,
  serviceOf,
  setupScript,
  startStopAce,
  tunnelConfigs,
  TUNNELS,
} from './vpn-tunnels';

const CONFIG = [
  '[Interface]',
  'PrivateKey = KEY',
  'Address = 10.77.0.3/32',
  'DNS = 1.1.1.1, 1.0.0.1',
  'MTU = 1280',
  'Jc = 5',
  'S1 = 20',
  'H1 = 101',
  '',
  '[Peer]',
  'PublicKey = SRV',
  'PresharedKey = PSK',
  'Endpoint = vpn.example.com:443',
  'AllowedIPs = 0.0.0.0/0, ::/0',
  'PersistentKeepalive = 25',
  '',
].join('\n');

describe('tunnelConfigs', () => {
  it('one blocks around the VPN, the other does not', () => {
    const configs = tunnelConfigs(CONFIG);
    expect(configs[TUNNELS.kill]).toContain('AllowedIPs = 0.0.0.0/0, ::/0');
    expect(configs[TUNNELS.open]).toContain(
      'AllowedIPs = 0.0.0.0/1, 128.0.0.0/1, ::/1, 8000::/1',
    );
    expect(configs[TUNNELS.open]).not.toContain('/0');
    expect(configs[TUNNELS.open]).toContain('Endpoint = vpn.example.com:443');
  });

  it('refuses anything that would run a command as the system', () => {
    expect(() => tunnelConfigs(`${CONFIG}PostUp = calc.exe\n`)).toThrow();
    expect(() => tunnelConfigs('hello')).toThrow();
  });
});

describe('services', () => {
  it('reads the state of one service and the running tunnels', () => {
    expect(serviceOf('dashboard')).toBe('AmneziaWGTunnel$dashboard');
    expect(parseServiceStatus('Running\r\n')).toBe('running');
    expect(parseServiceStatus('Stopped')).toBe('stopped');
    expect(parseServiceStatus('')).toBeNull();
    expect(
      runningTunnels('AmneziaWGManager\r\nAmneziaWGTunnel$nout\r\n'),
    ).toEqual(['nout']);
  });

  it('reads a SID and lets that user start and stop the tunnels', () => {
    const sid = 'S-1-5-21-1-2-3-1001';
    expect(parseSid('"laptop\\roman","S-1-5-21-1-2-3-1001"')).toBe(sid);
    expect(startStopAce(sid)).toBe(`(A;;RPWPLCLOCRRC;;;${sid})`);
  });
});

describe('scripts', () => {
  const plan = {
    awg: 'C:\\Program Files\\AmneziaWG\\amneziawg.exe',
    dir: 'C:\\ProgramData\\PersonalDashboard\\vpn',
    staged: "C:\\Users\\o'brien\\AppData\\Local\\Temp\\pd-vpn-1",
    sid: 'S-1-5-21-1-2-3-1001',
  };

  it('sets up both tunnels, started by hand and switchable by the user', () => {
    const script = setupScript(plan);
    expect(script).toContain("@('dashboard', 'dashboard-open')");
    expect(script).toContain('/installtunnelservice');
    expect(script).toContain('start= demand');
    expect(script).toContain(
      "$ace = '(A;;RPWPLCLOCRRC;;;S-1-5-21-1-2-3-1001)'",
    );
    // A quote in a path does not end the PowerShell string.
    expect(script).toContain(
      "'C:\\Users\\o''brien\\AppData\\Local\\Temp\\pd-vpn-1'",
    );
    expect(script).toContain('*S-1-5-32-544');
  });

  it('removes both tunnels and their folder', () => {
    const script = removeScript(plan);
    expect(script).toContain('/uninstalltunnelservice');
    expect(script).toContain(
      "Remove-Item -Recurse -Force 'C:\\ProgramData\\PersonalDashboard\\vpn'",
    );
  });
});

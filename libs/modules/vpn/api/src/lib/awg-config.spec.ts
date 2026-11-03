import {createPrivateKey, createPublicKey} from 'node:crypto';
import {
  counterDelta,
  deviceConfig,
  endpointAddress,
  freeAddress,
  generateKeyPair,
  generateObfuscation,
  networkOf,
  parseStatus,
  serverConfig,
} from './awg-config';

const obfuscation = {
  jc: 5,
  jmin: 40,
  jmax: 70,
  s1: 20,
  s2: 30,
  h1: 101,
  h2: 202,
  h3: 303,
  h4: 404,
};

describe('generateKeyPair', () => {
  it('gives a WireGuard pair: 32 bytes each, the public one of the private one', () => {
    const pair = generateKeyPair();
    expect(Buffer.from(pair.privateKey, 'base64')).toHaveLength(32);
    const header = Buffer.from('302e020100300506032b656e04220420', 'hex');
    const derived = createPublicKey(
      createPrivateKey({
        key: Buffer.concat([header, Buffer.from(pair.privateKey, 'base64')]),
        format: 'der',
        type: 'pkcs8',
      }),
    )
      .export({format: 'der', type: 'spki'})
      .subarray(-32)
      .toString('base64');
    expect(derived).toBe(pair.publicKey);
  });
});

describe('generateObfuscation', () => {
  it("keeps to AmneziaWG's limits", () => {
    for (let run = 0; run < 200; run++) {
      const o = generateObfuscation();
      expect(o.s1 + 56).not.toBe(o.s2);
      expect(new Set([o.h1, o.h2, o.h3, o.h4]).size).toBe(4);
      expect(Math.min(o.h1, o.h2, o.h3, o.h4)).toBeGreaterThan(4);
      expect(o.jmin).toBeLessThan(o.jmax);
    }
  });
});

describe('freeAddress', () => {
  it('takes the lowest free one after the server, and none when all are taken', () => {
    expect(freeAddress([])).toBe('10.77.0.2');
    expect(freeAddress(['10.77.0.2', '10.77.0.4'])).toBe('10.77.0.3');
    const all = Array.from({length: 253}, (_, i) => `10.77.0.${i + 2}`);
    expect(freeAddress(all)).toBeNull();
  });
});

describe('configs', () => {
  it('the server has its peers without wg-quick lines', () => {
    const text = serverConfig({privateKey: 'SRV', port: 37853, obfuscation}, [
      {publicKey: 'PUB', presharedKey: 'PSK', address: '10.77.0.2'},
    ]);
    expect(text).toContain('ListenPort = 37853');
    expect(text).toContain('S2 = 30');
    expect(text).toContain('AllowedIPs = 10.77.0.2/32');
    expect(text).not.toContain('Address');
    expect(text).not.toContain('DNS');
  });

  it('a device sends everything through the tunnel to the name, not the address', () => {
    const text = deviceConfig(
      {privateKey: 'DEV', presharedKey: 'PSK', address: '10.77.0.2'},
      {
        publicKey: 'SRVPUB',
        host: 'vpn.example.com',
        port: 37853,
        obfuscation,
      },
    );
    expect(text).toContain('Address = 10.77.0.2/32');
    expect(text).toContain('Endpoint = vpn.example.com:37853');
    expect(text).toContain('AllowedIPs = 0.0.0.0/0, ::/0');
    expect(text).toContain('H4 = 404');
    expect(text).toContain('MTU = 1280');
  });
});

describe('parseStatus', () => {
  it('reads the peers and skips broken lines', () => {
    expect(
      parseStatus(
        'KEY1\t1.2.3.4:5000\t1793700000\t100\t200\n' +
          'KEY2\t(none)\t0\t0\t0\n' +
          'broken line\n' +
          'KEY3\t1.2.3.4:1\tx\t1\t2\n',
      ),
    ).toEqual([
      {
        publicKey: 'KEY1',
        endpoint: '1.2.3.4:5000',
        latestHandshake: 1793700000,
        rx: 100,
        tx: 200,
      },
      {publicKey: 'KEY2', endpoint: null, latestHandshake: 0, rx: 0, tx: 0},
    ]);
  });
});

describe('networks', () => {
  it('cuts the port off and names the block of the address', () => {
    expect(endpointAddress('93.84.1.2:51000')).toBe('93.84.1.2');
    expect(endpointAddress('[2a02:1:2::5]:51000')).toBe('2a02:1:2::5');
    expect(networkOf('93.84.1.2')).toBe('93.84.0.0/16');
    expect(networkOf('2a02:01:2::5')).toBe('2a02:1:2::/48');
  });

  it('counts bytes across a restart of the interface', () => {
    expect(counterDelta(500, 200)).toBe(300);
    expect(counterDelta(50, 200)).toBe(50);
  });
});

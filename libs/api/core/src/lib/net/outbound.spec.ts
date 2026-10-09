import {
  assertPublicHost,
  isPrivateAddress,
  OutboundBlockedError,
  safeFetch,
  setPrivateAddressesAllowed,
} from './outbound';

describe('isPrivateAddress', () => {
  it('knows the local, private and metadata addresses', () => {
    for (const address of [
      '127.0.0.1',
      '10.1.2.3',
      '172.16.0.1',
      '172.31.255.255',
      '192.168.1.10',
      '169.254.169.254',
      '100.64.0.1',
      '0.0.0.0',
      '::1',
      '[::1]',
      'fd00::1',
      'fe80::1',
      '::ffff:10.0.0.1',
      '::ffff:7f00:1',
    ]) {
      expect([address, isPrivateAddress(address)]).toEqual([address, true]);
    }
  });

  it('lets the public ones through', () => {
    for (const address of ['1.1.1.1', '172.32.0.1', '192.167.1.1', '2606:4700:4700::1111']) {
      expect([address, isPrivateAddress(address)]).toEqual([address, false]);
    }
  });
});

describe('addresses users give', () => {
  afterEach(() => {
    setPrivateAddressesAllowed(true);
    vi.unstubAllGlobals();
  });

  it('refuses a private address when they are not allowed, and only then', async () => {
    setPrivateAddressesAllowed(false);
    await expect(assertPublicHost('127.0.0.1')).rejects.toBeInstanceOf(OutboundBlockedError);
    await expect(assertPublicHost('localhost')).rejects.toBeInstanceOf(OutboundBlockedError);
    await expect(assertPublicHost('1.1.1.1')).resolves.toBeUndefined();
    setPrivateAddressesAllowed(true);
    await expect(assertPublicHost('127.0.0.1')).resolves.toBeUndefined();
  });

  it('checks every redirect: a public page must not lead into the private network', async () => {
    setPrivateAddressesAllowed(false);
    const fetch = vi
      .fn()
      .mockResolvedValue(
        new Response(null, { status: 302, headers: { location: 'http://169.254.169.254/latest' } }),
      );
    vi.stubGlobal('fetch', fetch);
    await expect(safeFetch('http://1.1.1.1/start')).rejects.toBeInstanceOf(OutboundBlockedError);
    // The first address was asked; the private one it pointed to never was.
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('follows a redirect to a public address', async () => {
    setPrivateAddressesAllowed(false);
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 301, headers: { location: '/next' } }))
      .mockResolvedValueOnce(new Response('ok'));
    vi.stubGlobal('fetch', fetch);
    const response = await safeFetch('http://1.1.1.1/start');
    expect(await response.text()).toBe('ok');
    expect(String(fetch.mock.calls[1][0])).toBe('http://1.1.1.1/next');
  });

  it('refuses what is not http', async () => {
    await expect(safeFetch('file:///etc/passwd')).rejects.toBeInstanceOf(OutboundBlockedError);
  });
});

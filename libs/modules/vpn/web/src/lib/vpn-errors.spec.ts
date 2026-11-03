import {ApiError} from '@pd/client-core';
import {configFileName, vpnErrorKey} from './vpn-errors';

describe('configFileName', () => {
  it('spells a Cyrillic name in Latin letters within 15', () => {
    expect(configFileName('Мой телефон', 'phone')).toBe('moy_telefon.conf');
    expect(
      configFileName('Ноутбук с очень длинным названием', 'computer'),
    ).toBe('noutbuk_s_ochen.conf');
    expect(configFileName('Pixel 9 Pro', 'phone')).toBe('pixel_9_pro.conf');
  });

  it('falls back to the kind when nothing is left', () => {
    expect(configFileName('📱✨', 'phone')).toBe('vpn-phone.conf');
  });
});

describe('vpnErrorKey', () => {
  it("names the server's reason, or the status in general words", () => {
    expect(vpnErrorKey(new ApiError(400, {reason: 'full'}))).toBe(
      'vpn.errors.full',
    );
    expect(vpnErrorKey(new ApiError(400, {message: 'no'}))).toBe(
      'vpn.errors.refused',
    );
    expect(vpnErrorKey(new ApiError(404, null))).toBe('vpn.errors.gone');
    expect(vpnErrorKey(new Error('network'))).toBe('vpn.errors.offline');
  });
});

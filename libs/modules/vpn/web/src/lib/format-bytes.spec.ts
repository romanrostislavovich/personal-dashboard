import {formatBytes} from './format-bytes';

describe('formatBytes', () => {
  it('picks the unit and keeps one decimal below a hundred', () => {
    expect(formatBytes(0, 'en')).toBe('0 B');
    expect(formatBytes(1536, 'en')).toBe('1.5 KB');
    expect(formatBytes(250 * 1024 * 1024, 'en')).toBe('250 MB');
    expect(formatBytes(3.14 * 1024 ** 3, 'ru')).toBe('3,1 GB');
  });
});

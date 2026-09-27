import { pickMessages, toLocale } from './locale';

describe('toLocale', () => {
  it('maps language tags to supported locales', () => {
    expect(toLocale('ru')).toBe('ru');
    expect(toLocale('ru-RU')).toBe('ru');
    expect(toLocale('EN-us')).toBe('en');
  });

  it('falls back to English for unknown or missing languages', () => {
    expect(toLocale('de')).toBe('en');
    expect(toLocale(undefined)).toBe('en');
  });
});

describe('pickMessages', () => {
  it('returns the texts for the user language', () => {
    const messages = { en: { hi: 'Hello' }, ru: { hi: 'Привет' } };
    expect(pickMessages(messages, 'ru').hi).toBe('Привет');
    expect(pickMessages(messages, 'fr').hi).toBe('Hello');
  });
});

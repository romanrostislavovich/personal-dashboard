import { CRISIS_LINES, crisisCountryOf } from './crisis-lines';
import { telegramContact } from './psychology';

describe('the help button', () => {
  it('knows the country of the device by its time zone', () => {
    expect(crisisCountryOf('Europe/Warsaw')).toBe('PL');
    expect(crisisCountryOf('Europe/Kiev')).toBe('UA');
    expect(crisisCountryOf('America/Chicago')).toBe('US');
    expect(crisisCountryOf('Asia/Tokyo')).toBeNull();
    expect(crisisCountryOf(null)).toBeNull();
  });

  it('has an emergency number, a line and a source for every country', () => {
    for (const country of CRISIS_LINES) {
      expect(country.emergency).toMatch(/^\d{3}$/);
      expect(country.lines.length).toBeGreaterThan(0);
      expect(country.sources.length).toBeGreaterThan(0);
    }
  });

  it("takes a close person's Telegram as a username or a phone number", () => {
    expect(telegramContact('@mama_kate')).toBe('mama_kate');
    expect(telegramContact('https://t.me/mama_kate')).toBe('mama_kate');
    expect(telegramContact('+48 600 123 456')).toBe('+48600123456');
    expect(telegramContact('kate')).toBeNull(); // shorter than Telegram allows
    expect(telegramContact('600 123 456')).toBeNull(); // no country code
  });
});

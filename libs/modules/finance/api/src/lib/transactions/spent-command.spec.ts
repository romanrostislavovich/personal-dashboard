import {categoryFor, parseSpent} from './spent-command';

describe('/spent', () => {
  it('reads the amount, a currency code and what it was for', () => {
    expect(parseSpent('12 coffee')).toEqual({
      amount: 12,
      currency: null,
      what: 'coffee',
    });
    expect(parseSpent('12,50 eur taxi to the airport')).toEqual({
      amount: 12.5,
      currency: 'EUR',
      what: 'taxi to the airport',
    });
    expect(parseSpent('40')).toEqual({amount: 40, currency: null, what: ''});
    // Three letters that are not a currency are what it was for.
    expect(parseSpent('7 tea')).toEqual({
      amount: 7,
      currency: null,
      what: 'tea',
    });
    expect(parseSpent('5 usd')).toEqual({amount: 5, currency: 'USD', what: ''});
  });

  it('refuses what is not an expense', () => {
    expect(parseSpent('coffee 12')).toBeNull();
    expect(parseSpent('0 nothing')).toBeNull();
    expect(parseSpent('')).toBeNull();
  });

  it('picks a category the user has, or makes one of the words', () => {
    const known = ['Coffee', 'Taxi', 'Еда'];
    expect(categoryFor('coffee with Anna', known, 'Other')).toBe('Coffee');
    expect(categoryFor('еда', known, 'Other')).toBe('Еда');
    expect(categoryFor('cinema tickets', known, 'Other')).toBe(
      'Cinema tickets',
    );
    expect(categoryFor('', known, 'Other')).toBe('Other');
  });
});

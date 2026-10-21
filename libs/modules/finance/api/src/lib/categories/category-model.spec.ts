import { evaluate, features, predict, train } from './category-model';

/** A made-up history: shops of a few kinds, several counterparties each. */
const history = [
  ...[
    'BIEDRONKA 4521',
    'BIEDRONKA 0012',
    'LIDL SP Z OO',
    'LIDL WARSZAWA',
    'ŻABKA Z5521',
    'ŻABKA Z0410',
    'CARREFOUR EXPRESS',
    'AUCHAN POLSKA',
  ].flatMap((shop, i) =>
    [12, 48, 85].map((amount) => ({
      counterparty: shop,
      text: `${shop} zakup kartą`,
      amount: amount + i,
      category: 'Groceries',
    })),
  ),
  ...[
    'ORLEN STACJA 112',
    'ORLEN STACJA 57',
    'BP STACJA PALIW',
    'SHELL 0041',
    'CIRCLE K WAWA',
    'BOLT RIDE',
    'UBER TRIP',
    'FREENOW',
  ].flatMap((shop, i) =>
    [18, 160, 240].map((amount) => ({
      counterparty: shop,
      text: `${shop} paliwo przejazd`,
      amount: amount + i,
      category: 'Transport',
    })),
  ),
  ...[
    'NETFLIX.COM',
    'SPOTIFY P1234',
    'YOUTUBE PREMIUM',
    'APPLE.COM/BILL',
    'HBO MAX',
    'DISNEY PLUS',
    'GOOGLE ONE',
    'ICLOUD STORAGE',
  ].flatMap((shop) =>
    [15, 15, 15].map((amount) => ({
      counterparty: shop,
      text: `${shop} subscription`,
      amount,
      category: 'Subscriptions',
    })),
  ),
];

describe('the category model', () => {
  it('sees words, pieces of words and the size of the amount', () => {
    const found = features('Żabka Z5521', 12.49);
    expect(found).toContain('w:żabka');
    expect(found).toContain('#^ża');
    expect(found).toContain('$3');
  });

  it("sorts a counterparty it never saw into the user's own category, and says how sure", () => {
    const model = train(history);
    const [best] = predict(model, 'LIDL KRAKÓW zakup kartą', 40);
    expect(best.category).toBe('Groceries');
    expect(best.probability).toBeGreaterThan(0.8);
    expect(predict(model, 'ORLEN STACJA 999 paliwo', 200)[0].category).toBe('Transport');
  });

  it('is measured on counterparties it never saw', () => {
    const quality = evaluate(history, 0.8);
    expect(quality.examples).toBe(history.length);
    expect(quality.categories).toBe(3);
    expect(quality.accuracy).toBeGreaterThan(0.8);
    expect(quality.sureAccuracy).toBeGreaterThanOrEqual(quality.accuracy);
  });
});

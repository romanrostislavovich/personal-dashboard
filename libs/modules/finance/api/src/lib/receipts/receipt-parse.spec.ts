import { parseReceipt } from './receipt-parse';

const fallback = { currency: 'PLN', today: '2026-10-03' };

describe('parseReceipt', () => {
  it('reads the answer of the AI, cleaned', () => {
    const answer =
      'Sure: {"isReceipt": true, "shop": "Biedronka", "total": "45,20", "currency": "pln", "date": "2026-10-02", "category": "Еда"}';
    expect(parseReceipt(answer, fallback)).toEqual({
      shop: 'Biedronka',
      total: 45.2,
      currency: 'PLN',
      date: '2026-10-02',
      category: 'Еда',
    });
  });

  it('takes the main currency and today when the receipt does not tell', () => {
    const read = parseReceipt('{"total": 12, "currency": "zł", "date": "2031-01-01"}', fallback);
    expect(read).toMatchObject({ currency: 'PLN', date: '2026-10-03', category: 'Other' });
  });

  it('refuses a photo that is not a receipt, and an answer that is not JSON', () => {
    expect(parseReceipt('{"isReceipt": false}', fallback)).toBeNull();
    expect(parseReceipt('{"total": 0}', fallback)).toBeNull();
    expect(parseReceipt('I see a cat.', fallback)).toBeNull();
  });
});

import { claimsChange } from './claims-change';

describe('claimsChange', () => {
  it('spots confirmations in Russian and English', () => {
    expect(claimsChange('Записал: расход 3,20 EUR')).toBe(true);
    expect(claimsChange('Готово, добавила в дневник')).toBe(true);
    expect(claimsChange('Saved the birthday of Masha')).toBe(true);
    expect(claimsChange('Удалила транзакцию на 12 EUR')).toBe(true);
    expect(claimsChange('Deleted the monitor')).toBe(true);
  });

  it('ignores answers that change nothing', () => {
    expect(claimsChange('В сентябре ты потратил 120 EUR')).toBe(false);
    expect(claimsChange('Upcoming birthdays: Masha on March 14')).toBe(false);
    // Asking for a confirmation is not a claim.
    expect(claimsChange('Удалить транзакцию «Кофе» на 3,20 EUR? Подтверди, пожалуйста')).toBe(
      false,
    );
    // Part of a longer word is not a claim.
    expect(claimsChange('Your address was updatedAt yesterday')).toBe(false);
  });
});

import { searchText } from './search-text';

describe('searchText', () => {
  it('leaves the links of a shared text out', () => {
    expect(searchText('Дюна: Часть вторая https://www.netflix.com/title/81564899')).toBe(
      'Дюна: Часть вторая',
    );
    expect(searchText('  Moana\n https://kinogo.example/moana  ')).toBe('Moana');
  });
});

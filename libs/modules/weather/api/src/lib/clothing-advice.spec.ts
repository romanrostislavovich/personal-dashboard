import { clothingAdvice, DaytimeWeather } from './clothing-advice';

const mild: DaytimeWeather = {
  apparentMin: 18,
  apparentMax: 20,
  precipitationProbability: 0,
  precipitation: 0,
  windSpeedMax: 10,
  uvIndexMax: 2,
  conditions: ['cloudy'],
};

describe('clothingAdvice', () => {
  it('picks the outfit by the coldest "feels like" temperature', () => {
    expect(clothingAdvice(mild).outfit).toBe('long-sleeve');
    expect(clothingAdvice({ ...mild, apparentMin: -20 }).outfit).toBe('heavy-winter');
    expect(clothingAdvice({ ...mild, apparentMin: 8 }).outfit).toBe('jacket');
    expect(clothingAdvice({ ...mild, apparentMin: 30, apparentMax: 32 }).outfit).toBe('hot');
  });

  it('adds nothing on a calm mild day', () => {
    expect(clothingAdvice(mild).extras).toEqual([]);
  });

  it('suggests layers when the day warms up a lot', () => {
    expect(clothingAdvice({ ...mild, apparentMin: 8, apparentMax: 19 }).extras).toContain('layers');
  });

  it('takes an umbrella for likely rain, a raincoat when it is windy', () => {
    const rainy = { ...mild, precipitationProbability: 70, conditions: ['rain' as const] };
    expect(clothingAdvice(rainy).extras).toContain('umbrella');
    expect(clothingAdvice({ ...rainy, windSpeedMax: 45 }).extras).toEqual(['raincoat']);
  });

  it('dresses for snow and frost', () => {
    const extras = clothingAdvice({
      ...mild,
      apparentMin: -8,
      apparentMax: -3,
      precipitation: 3,
      conditions: ['snow'],
    }).extras;
    expect(extras).toEqual(['waterproof-shoes', 'hat', 'gloves', 'scarf']);
  });

  it('protects from the sun on a hot day', () => {
    const extras = clothingAdvice({
      ...mild,
      apparentMin: 24,
      apparentMax: 30,
      uvIndexMax: 8,
    }).extras;
    expect(extras).toEqual(['sunglasses', 'sunscreen', 'cap']);
  });
});

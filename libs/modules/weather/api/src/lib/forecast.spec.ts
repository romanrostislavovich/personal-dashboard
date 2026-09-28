import { toForecast } from './forecast';
import raw from './forecast.fixture.json';
import { RawForecast } from './open-meteo.client';

// A real Open-Meteo answer for Warsaw, 2026-09-28: a clear, cool morning and a warm afternoon.
const warsaw = {
  name: 'Warsaw',
  region: null,
  country: 'Poland',
  latitude: 52.23,
  longitude: 21.01,
};

describe('toForecast', () => {
  const forecast = toForecast(raw as RawForecast, warsaw);

  it('maps today and now', () => {
    expect(forecast.today).toMatchObject({
      date: '2026-09-28',
      condition: 'clear',
      min: 10,
      max: 21,
      uvIndexMax: 3.9,
      sunrise: '06:31',
      sunset: '18:20',
    });
    expect(forecast.now.isDay).toBe(false);
  });

  it('shows hours from the morning', () => {
    expect(forecast.hours[0]?.time).toBe('06:00');
    expect(forecast.hours.at(-1)?.time).toBe('23:00');
  });

  it('dresses for the cool morning and suggests layers for the warm afternoon', () => {
    expect(forecast.clothing).toEqual({ outfit: 'jacket', extras: ['layers'] });
  });
});

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

describe('toForecast for a week', () => {
  /** Two days: a cold wet Monday and a warm dry Tuesday; only two daytime hours each. */
  const series = <T>(monday: T, tuesday: T) => [monday, monday, tuesday, tuesday];
  const week: RawForecast = {
    current: {
      temperature_2m: 4,
      apparent_temperature: 1,
      weather_code: 61,
      wind_speed_10m: 12,
      is_day: 1,
    },
    hourly: {
      time: ['2026-10-05T09:00', '2026-10-05T15:00', '2026-10-06T09:00', '2026-10-06T15:00'],
      temperature_2m: series(4, 22),
      apparent_temperature: series(1, 22),
      precipitation_probability: series(90, 0),
      precipitation: series(2, 0),
      weather_code: series(61, 0),
      wind_speed_10m: series(12, 5),
      uv_index: series(1, 3),
    },
    daily: {
      time: ['2026-10-05', '2026-10-06'],
      weather_code: [61, 0],
      temperature_2m_min: [2, 14],
      temperature_2m_max: [5, 23],
      apparent_temperature_min: [-1, 13],
      apparent_temperature_max: [3, 23],
      precipitation_sum: [6.2, 0],
      precipitation_probability_max: [90, 5],
      wind_speed_10m_max: [14, 8],
      uv_index_max: [1, 3],
      sunrise: ['2026-10-05T06:43', '2026-10-06T06:45'],
      sunset: ['2026-10-05T18:04', '2026-10-06T18:02'],
    },
  };

  it('gives every day its own numbers and clothing advice', () => {
    const { days, hours, clothing } = toForecast(week, warsaw);
    expect(days.map((day) => [day.date, day.max, day.clothing.outfit])).toEqual([
      ['2026-10-05', 5, 'warm'],
      ['2026-10-06', 23, 'summer'],
    ]);
    expect(days[0].clothing.extras).toContain('umbrella');
    expect(days[1].clothing.extras).not.toContain('umbrella');
    // The hourly strip and the main advice stay about today.
    expect(hours.map((hour) => hour.time)).toEqual(['09:00', '15:00']);
    expect(clothing).toEqual(days[0].clothing);
  });

  it("applies the user's scale to every day", () => {
    const forecast = toForecast(week, warsaw, 2);
    expect(forecast.thermalFeel).toBe(2);
    expect(forecast.days.map((day) => day.clothing.outfit)).toEqual(['jacket', 'hot']);
  });
});

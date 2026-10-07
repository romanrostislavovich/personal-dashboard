import { pastWeatherMetrics } from './past-weather';

describe('pastWeatherMetrics', () => {
  it('turns the archive into daily numbers and leaves out the days not measured yet', () => {
    const metrics = pastWeatherMetrics({
      daily: {
        time: ['2026-10-01', '2026-10-02', '2026-10-03'],
        temperature_2m_mean: [12.34, 9, null],
        precipitation_sum: [0, 4.26, null],
        sunshine_duration: [18000, 3600, null],
      },
    });
    expect(metrics.map((metric) => [metric.key, metric.unit, metric.days])).toEqual([
      [
        'weather.temperature',
        'degrees',
        [
          { day: '2026-10-01', value: 12.3 },
          { day: '2026-10-02', value: 9 },
        ],
      ],
      [
        'weather.rain',
        'count',
        [
          { day: '2026-10-01', value: 0 },
          { day: '2026-10-02', value: 4.3 },
        ],
      ],
      [
        'weather.sun',
        'hours',
        [
          { day: '2026-10-01', value: 5 },
          { day: '2026-10-02', value: 1 },
        ],
      ],
    ]);
  });

  it('copes with an answer without days', () => {
    expect(pastWeatherMetrics({})).toEqual([]);
  });
});

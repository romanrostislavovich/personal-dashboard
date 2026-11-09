import {DailyMetric, LocalDate} from '@pd/contracts';

const ARCHIVE_URL = 'https://archive-api.open-meteo.com/v1/archive';
const TIMEOUT_MS = 15_000;
const HOUR = 3600;

/** The days of Open-Meteo's archive; a value is `null` for a day not measured yet. */
export interface RawPastWeather {
  daily?: {
    time: LocalDate[];
    temperature_2m_mean?: (number | null)[];
    precipitation_sum?: (number | null)[];
    sunshine_duration?: (number | null)[];
  };
}

/**
 * The weather of past days as daily numbers: the mean temperature, the rain and the hours of
 * sun. The archive is a few days behind: the latest days are simply left out.
 */
export function pastWeatherMetrics(raw: RawPastWeather): DailyMetric[] {
  const daily = raw.daily;
  if (!daily) {
    return [];
  }
  const series = (values: (number | null)[] | undefined, scale = 1) =>
    daily.time.flatMap((day, index) => {
      const value = values?.[index];
      return value === null || value === undefined
        ? []
        : [{day, value: Math.round((value / scale) * 10) / 10}];
    });
  const metrics: DailyMetric[] = [
    {
      key: 'weather.temperature',
      module: 'weather',
      labelKey: 'weather.links.temperature',
      unit: 'degrees',
      days: series(daily.temperature_2m_mean),
    },
    {
      key: 'weather.rain',
      module: 'weather',
      labelKey: 'weather.links.rain',
      unit: 'count',
      days: series(daily.precipitation_sum),
    },
    {
      key: 'weather.sun',
      module: 'weather',
      labelKey: 'weather.links.sun',
      unit: 'hours',
      days: series(daily.sunshine_duration, HOUR),
    },
  ];
  return metrics.filter(metric => metric.days.length > 0);
}

/** The first day the archive has. */
const ARCHIVE_START: LocalDate = '1940-01-01';

/**
 * The part of a period the archive can answer: it answers 400 to a day before 1940 or after
 * today (in UTC). Yesterday in UTC is the last day asked for, so a place ahead of UTC never
 * asks for "tomorrow"; the newest days have no values yet anyway. `null` — nothing to ask.
 */
export function archivePeriod(
  from: LocalDate,
  to: LocalDate,
  now = new Date(),
): {from: LocalDate; to: LocalDate} | null {
  const yesterday = new Date(now.getTime() - 24 * HOUR * 1000)
    .toISOString()
    .slice(0, 10);
  const start = from < ARCHIVE_START ? ARCHIVE_START : from;
  const end = to > yesterday ? yesterday : to;
  return start <= end ? {from: start, to: end} : null;
}

/** The archive of a place for a period: free, without a key. */
export async function fetchPastWeather(
  place: {latitude: number; longitude: number},
  from: LocalDate,
  to: LocalDate,
): Promise<RawPastWeather> {
  const period = archivePeriod(from, to);
  if (!period) {
    return {};
  }
  const params = new URLSearchParams({
    latitude: String(place.latitude),
    longitude: String(place.longitude),
    start_date: period.from,
    end_date: period.to,
    daily: 'temperature_2m_mean,precipitation_sum,sunshine_duration',
    timezone: 'auto',
  });
  const response = await fetch(`${ARCHIVE_URL}?${params}`, {
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`Open-Meteo archive ${response.status}`);
  }
  return (await response.json()) as RawPastWeather;
}

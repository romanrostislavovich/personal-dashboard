import {LinksForecast, LinksForecasts, PastForecast} from '@pd/contracts';

/* The forecasts of the card grouped by day, with how close the kept ones came. */

/** The kept forecasts of a target worth a "how close" line: fewer say nothing. */
const MIN_PAST = 3;

export interface ForecastItem {
  forecast: LinksForecast;
  /** How much closer than the plain guess, percent. */
  better: number;
  /** The kept trusted morning forecasts with what the days were: their mean miss, how many. */
  past: {miss: number; days: number} | null;
  /** Yesterday's kept morning forecast of it and what the day was (known days only). */
  yesterday: (PastForecast & {actual: number}) | null;
}

export interface ForecastGroup {
  day: string;
  made: LinksForecast['made'];
  items: ForecastItem[];
}

/**
 * Today's group and, in the evening, tomorrow's. The lines of the kept forecasts go with the
 * morning ones only: those are what the past ones were (the evening's are rougher, and their
 * "yesterday" would be today). `compact` (the Home widget) keeps the trusted ones only, and no
 * empty group.
 */
export function forecastGroups(
  data: LinksForecasts,
  compact: boolean,
): ForecastGroup[] {
  const yesterday = shiftDay(data.today, -1);
  const mornings = data.past.filter(
    (one): one is PastForecast & {actual: number} =>
      one.made === 'morning' && one.actual !== null,
  );
  const days = [...new Set(data.forecasts.map(one => one.day))].sort();
  return days
    .map(day => {
      const ofDay = data.forecasts.filter(one => one.day === day);
      const items = ofDay
        .filter(one => !compact || (one.trusted && one.value !== null))
        .map(forecast => {
          const morning = forecast.made === 'morning';
          const kept = mornings.filter(
            one => one.key === forecast.key && one.trusted,
          );
          return {
            forecast,
            better:
              forecast.error !== null && forecast.baselineError
                ? Math.round(
                    (1 - forecast.error / forecast.baselineError) * 100,
                  )
                : 0,
            past:
              morning && kept.length >= MIN_PAST
                ? {
                    miss:
                      kept.reduce(
                        (sum, one) => sum + Math.abs(one.value - one.actual),
                        0,
                      ) / kept.length,
                    days: kept.length,
                  }
                : null,
            yesterday: morning
              ? (mornings.find(
                  one => one.key === forecast.key && one.day === yesterday,
                ) ?? null)
              : null,
          };
        });
      return {day, made: ofDay[0].made, items};
    })
    .filter(group => !compact || group.items.length);
}

function shiftDay(day: string, by: number): string {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + by);
  return date.toISOString().slice(0, 10);
}

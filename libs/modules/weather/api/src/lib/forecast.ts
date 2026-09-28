import { WeatherForecast, WeatherLocation } from '@pd/contracts';
import { clothingAdvice } from './clothing-advice';
import { RawForecast } from './open-meteo.client';
import { weatherCondition } from './weather-code';

/** Hours shown on the page, local time. */
const FIRST_SHOWN_HOUR = 6;
/** Hours you are likely to be outside — the clothing advice looks at them. */
const DAYTIME_FROM = 8;
const DAYTIME_TO = 21;

/** Open-Meteo's answer → the forecast the dashboard shows. */
export function toForecast(raw: RawForecast, location: WeatherLocation): WeatherForecast {
  const { current, daily } = raw;
  const hours = hourlyRows(raw);
  const daytime = hours.filter((h) => h.hour >= DAYTIME_FROM && h.hour <= DAYTIME_TO);
  // A model without hourly data for today: fall back to the daily numbers.
  const outside = daytime.length > 0 ? daytime : hours;

  const apparent = outside.map((h) => h.apparentTemperature);
  const apparentMin = apparent.length
    ? Math.min(...apparent)
    : num(daily.apparent_temperature_min[0]);
  const apparentMax = apparent.length
    ? Math.max(...apparent)
    : num(daily.apparent_temperature_max[0]);

  return {
    location,
    now: {
      temperature: round(current.temperature_2m),
      apparentTemperature: round(current.apparent_temperature),
      condition: weatherCondition(current.weather_code),
      windSpeed: round(current.wind_speed_10m),
      isDay: current.is_day === 1,
    },
    today: {
      date: daily.time[0] ?? '',
      condition: weatherCondition(num(daily.weather_code[0])),
      min: round(num(daily.temperature_2m_min[0])),
      max: round(num(daily.temperature_2m_max[0])),
      apparentMin: round(num(daily.apparent_temperature_min[0])),
      apparentMax: round(num(daily.apparent_temperature_max[0])),
      precipitationProbability: num(daily.precipitation_probability_max[0]),
      precipitation: round(num(daily.precipitation_sum[0]), 1),
      windSpeedMax: round(num(daily.wind_speed_10m_max[0])),
      uvIndexMax: round(num(daily.uv_index_max[0]), 1),
      sunrise: clock(daily.sunrise[0]),
      sunset: clock(daily.sunset[0]),
    },
    hours: hours
      .filter((h) => h.hour >= FIRST_SHOWN_HOUR)
      .map((h) => ({
        time: h.time,
        temperature: round(h.temperature),
        apparentTemperature: round(h.apparentTemperature),
        condition: weatherCondition(h.weatherCode),
        precipitationProbability: h.precipitationProbability,
      })),
    clothing: clothingAdvice({
      apparentMin,
      apparentMax,
      precipitationProbability: Math.max(0, ...outside.map((h) => h.precipitationProbability)),
      precipitation: outside.reduce((sum, h) => sum + h.precipitation, 0),
      windSpeedMax: Math.max(0, ...outside.map((h) => h.windSpeed)),
      uvIndexMax: Math.max(0, ...outside.map((h) => h.uvIndex)),
      conditions: outside.map((h) => weatherCondition(h.weatherCode)),
    }),
  };
}

/** Hourly series as rows; hours without a temperature are dropped. */
function hourlyRows({ hourly }: RawForecast) {
  return hourly.time.flatMap((time, i) => {
    const temperature = hourly.temperature_2m[i];
    const apparentTemperature = hourly.apparent_temperature[i];
    if (temperature == null || apparentTemperature == null) {
      return [];
    }
    return [
      {
        time: clock(time),
        hour: Number(clock(time).slice(0, 2)),
        temperature,
        apparentTemperature,
        weatherCode: num(hourly.weather_code[i]),
        precipitationProbability: num(hourly.precipitation_probability[i]),
        precipitation: num(hourly.precipitation[i]),
        windSpeed: num(hourly.wind_speed_10m[i]),
        uvIndex: num(hourly.uv_index[i]),
      },
    ];
  });
}

/** `2026-09-28T07:00` → `07:00`. */
function clock(dateTime: string | undefined): string {
  return dateTime?.slice(11, 16) ?? '';
}

function num(value: number | null | undefined): number {
  return value ?? 0;
}

function round(value: number, digits = 0): number {
  const factor = 10 ** digits;
  // `+ 0` turns -0 into 0: "-0°" looks odd.
  return Math.round(value * factor) / factor + 0;
}

import {
  ClothingAdvice,
  ThermalFeel,
  WeatherDay,
  WeatherForecast,
  WeatherLocation,
} from '@pd/contracts';
import { clothingAdvice } from './clothing-advice';
import { RawForecast } from './open-meteo.client';
import { weatherCondition } from './weather-code';

/** Hours shown on the page, local time. */
const FIRST_SHOWN_HOUR = 6;
/** Hours you are likely to be outside — the clothing advice looks at them. */
const DAYTIME_FROM = 8;
const DAYTIME_TO = 21;

type HourRow = ReturnType<typeof hourlyRows>[number];

/**
 * Open-Meteo's answer → the forecast the dashboard shows: today in detail and the days ahead.
 * `thermalFeel` is how the user takes the cold; it shifts the clothing advice of every day.
 */
export function toForecast(
  raw: RawForecast,
  location: WeatherLocation,
  thermalFeel: ThermalFeel = 0,
): WeatherForecast {
  const { current, daily } = raw;
  const allHours = hourlyRows(raw);
  const days = daily.time.map((date, index) =>
    toDay(
      raw,
      index,
      allHours.filter((h) => h.date === date),
      thermalFeel,
    ),
  );
  const todayHours = allHours.filter((h) => h.date === daily.time[0]);

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
    hours: todayHours
      .filter((h) => h.hour >= FIRST_SHOWN_HOUR)
      .map((h) => ({
        time: h.time,
        temperature: round(h.temperature),
        apparentTemperature: round(h.apparentTemperature),
        condition: weatherCondition(h.weatherCode),
        precipitationProbability: h.precipitationProbability,
      })),
    clothing: days[0]?.clothing ?? dayAdvice(raw, 0, todayHours, thermalFeel),
    days,
    thermalFeel,
  };
}

/** One day of the week ahead: the daily numbers and what to wear. */
function toDay(
  raw: RawForecast,
  index: number,
  hours: HourRow[],
  thermalFeel: ThermalFeel,
): WeatherDay {
  const { daily } = raw;
  return {
    date: daily.time[index],
    condition: weatherCondition(num(daily.weather_code[index])),
    min: round(num(daily.temperature_2m_min[index])),
    max: round(num(daily.temperature_2m_max[index])),
    precipitationProbability: num(daily.precipitation_probability_max[index]),
    precipitation: round(num(daily.precipitation_sum[index]), 1),
    windSpeedMax: round(num(daily.wind_speed_10m_max[index])),
    clothing: dayAdvice(raw, index, hours, thermalFeel),
  };
}

/** What to wear on a day, by the hours you are likely to be outside. */
function dayAdvice(
  { daily }: RawForecast,
  index: number,
  hours: HourRow[],
  thermalFeel: ThermalFeel,
): ClothingAdvice {
  const daytime = hours.filter((h) => h.hour >= DAYTIME_FROM && h.hour <= DAYTIME_TO);
  // A model without hourly data for the day: fall back to the daily numbers.
  const outside = daytime.length > 0 ? daytime : hours;
  const apparent = outside.map((h) => h.apparentTemperature);

  return clothingAdvice(
    {
      apparentMin: apparent.length
        ? Math.min(...apparent)
        : num(daily.apparent_temperature_min[index]),
      apparentMax: apparent.length
        ? Math.max(...apparent)
        : num(daily.apparent_temperature_max[index]),
      precipitationProbability: outside.length
        ? Math.max(0, ...outside.map((h) => h.precipitationProbability))
        : num(daily.precipitation_probability_max[index]),
      precipitation: outside.length
        ? outside.reduce((sum, h) => sum + h.precipitation, 0)
        : num(daily.precipitation_sum[index]),
      windSpeedMax: outside.length
        ? Math.max(0, ...outside.map((h) => h.windSpeed))
        : num(daily.wind_speed_10m_max[index]),
      uvIndexMax: outside.length
        ? Math.max(0, ...outside.map((h) => h.uvIndex))
        : num(daily.uv_index_max[index]),
      conditions: outside.length
        ? outside.map((h) => weatherCondition(h.weatherCode))
        : [weatherCondition(num(daily.weather_code[index]))],
    },
    thermalFeel,
  );
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
        date: time.slice(0, 10),
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

import { WeatherCondition } from '@pd/contracts';

/**
 * WMO weather interpretation codes (what Open-Meteo returns as `weather_code`)
 * grouped into the conditions the dashboard shows.
 */
const CONDITIONS: [codes: number[], condition: WeatherCondition][] = [
  [[0], 'clear'],
  [[1, 2], 'partly-cloudy'],
  [[3], 'cloudy'],
  [[45, 48], 'fog'],
  [[51, 53, 55], 'drizzle'],
  [[56, 57, 66, 67], 'freezing-rain'],
  [[61, 63, 65], 'rain'],
  [[80, 81, 82], 'showers'],
  [[71, 73, 75, 77], 'snow'],
  [[85, 86], 'snow-showers'],
  [[95, 96, 99], 'thunderstorm'],
];

export function weatherCondition(code: number): WeatherCondition {
  return CONDITIONS.find(([codes]) => codes.includes(code))?.[1] ?? 'cloudy';
}

export function isSnow(condition: WeatherCondition): boolean {
  return condition === 'snow' || condition === 'snow-showers';
}

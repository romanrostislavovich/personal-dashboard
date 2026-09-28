import { ClothingExtra, WeatherCondition } from '@pd/contracts';

const CONDITION_EMOJI: Record<WeatherCondition, string> = {
  clear: '☀️',
  'partly-cloudy': '⛅',
  cloudy: '☁️',
  fog: '🌫️',
  drizzle: '🌦️',
  rain: '🌧️',
  'freezing-rain': '🧊',
  showers: '🌦️',
  snow: '🌨️',
  'snow-showers': '🌨️',
  thunderstorm: '⛈️',
};

/** A sun at night looks wrong: clear and partly cloudy skies get a moon. */
export function conditionEmoji(condition: WeatherCondition, isDay = true): string {
  if (!isDay && condition === 'clear') {
    return '🌙';
  }
  if (!isDay && condition === 'partly-cloudy') {
    return '☁️';
  }
  return CONDITION_EMOJI[condition];
}

export const EXTRA_EMOJI: Record<ClothingExtra, string> = {
  layers: '🧅',
  umbrella: '☂️',
  raincoat: '🧥',
  'waterproof-shoes': '🥾',
  windproof: '🌬️',
  hat: '🧶',
  gloves: '🧤',
  scarf: '🧣',
  sunglasses: '🕶️',
  sunscreen: '🧴',
  cap: '🧢',
};

/** `HH:mm` between sunrise and sunset. */
export function isDaytime(time: string, sunrise: string, sunset: string): boolean {
  return time >= sunrise && time < sunset;
}

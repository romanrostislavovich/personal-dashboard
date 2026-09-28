import { ClothingAdvice, ClothingExtra, Outfit, WeatherCondition } from '@pd/contracts';
import { isSnow } from './weather-code';

/** The weather during the hours you are likely to be outside. */
export interface DaytimeWeather {
  /** Lowest and highest "feels like" temperature, °C. */
  apparentMin: number;
  apparentMax: number;
  /** Highest chance of precipitation in any hour, %. */
  precipitationProbability: number;
  /** Total precipitation, mm. */
  precipitation: number;
  /** Strongest wind, km/h. */
  windSpeedMax: number;
  uvIndexMax: number;
  conditions: WeatherCondition[];
}

/**
 * The outfit follows the coldest "feels like" temperature of the day: dress for the morning,
 * take a layer off later. Upper bounds, °C, from the warmest outfit to the lightest.
 */
const OUTFIT_BELOW: [below: number, outfit: Outfit][] = [
  [-15, 'heavy-winter'],
  [-5, 'winter'],
  [5, 'warm'],
  [12, 'jacket'],
  [17, 'light-jacket'],
  [21, 'long-sleeve'],
  [27, 'summer'],
];

/** From this difference between the coldest and the warmest hour, dress in layers. */
const LAYERS_SPREAD = 8;
/** Wind, km/h, at which an umbrella is useless and a cool day feels colder. */
const STRONG_WIND = 35;
const LIKELY_RAIN_PERCENT = 50;
const SOME_RAIN_MM = 1;
const HEAVY_RAIN_MM = 5;

export function clothingAdvice(weather: DaytimeWeather): ClothingAdvice {
  const { apparentMin, apparentMax, windSpeedMax, uvIndexMax } = weather;
  const outfit = OUTFIT_BELOW.find(([below]) => apparentMin < below)?.[1] ?? 'hot';
  const extras = new Set<ClothingExtra>();

  if (apparentMax - apparentMin >= LAYERS_SPREAD) {
    extras.add('layers');
  }

  const snow = weather.conditions.some(isSnow);
  const wet =
    weather.precipitationProbability >= LIKELY_RAIN_PERCENT ||
    weather.precipitation >= SOME_RAIN_MM;
  if (wet && !snow) {
    extras.add(windSpeedMax >= STRONG_WIND ? 'raincoat' : 'umbrella');
  }
  if (snow || (wet && weather.precipitation >= HEAVY_RAIN_MM)) {
    extras.add('waterproof-shoes');
  }
  if (windSpeedMax >= STRONG_WIND && apparentMin < 15 && !extras.has('raincoat')) {
    extras.add('windproof');
  }

  if (apparentMin < 5) {
    extras.add('hat');
  }
  if (apparentMin < 0) {
    extras.add('gloves').add('scarf');
  }

  if (uvIndexMax >= 5) {
    extras.add('sunglasses');
  }
  if (uvIndexMax >= 6) {
    extras.add('sunscreen');
  }
  if (uvIndexMax >= 5 && apparentMax >= 25) {
    extras.add('cap');
  }

  return { outfit, extras: [...extras] };
}

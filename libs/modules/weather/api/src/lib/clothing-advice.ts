import {
  ClothingAdvice,
  ClothingExtra,
  Outfit,
  THERMAL_STEP_DEGREES,
  ThermalFeel,
  WeatherCondition,
} from '@pd/contracts';
import {isSnow} from './weather-code';

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

/**
 * `thermalFeel` is the user's own scale: someone who is always warm (+2) dresses as if it were
 * 6° warmer outside, someone who freezes (−2) as if it were 6° colder. It moves everything that
 * depends on the temperature; rain and sun are the same for everyone.
 */
export function clothingAdvice(
  weather: DaytimeWeather,
  thermalFeel: ThermalFeel = 0,
): ClothingAdvice {
  const shift = thermalFeel * THERMAL_STEP_DEGREES;
  const feel = {
    min: weather.apparentMin + shift,
    max: weather.apparentMax + shift,
  };
  const outfit = OUTFIT_BELOW.find(([below]) => feel.min < below)?.[1] ?? 'hot';
  const extras: ClothingExtra[] = [
    ...(feel.max - feel.min >= LAYERS_SPREAD ? (['layers'] as const) : []),
    ...rainAndWindExtras(weather, feel.min),
    ...coldExtras(feel.min),
    ...sunExtras(weather.uvIndexMax, feel.max),
  ];
  return {outfit, extras};
}

/** An umbrella or a raincoat, shoes for puddles and snow, something against the wind. */
function rainAndWindExtras(
  weather: DaytimeWeather,
  feelMin: number,
): ClothingExtra[] {
  const snow = weather.conditions.some(isSnow);
  const wet =
    weather.precipitationProbability >= LIKELY_RAIN_PERCENT ||
    weather.precipitation >= SOME_RAIN_MM;
  const windy = weather.windSpeedMax >= STRONG_WIND;
  const extras: ClothingExtra[] = [];
  if (wet && !snow) {
    extras.push(windy ? 'raincoat' : 'umbrella');
  }
  if (snow || (wet && weather.precipitation >= HEAVY_RAIN_MM)) {
    extras.push('waterproof-shoes');
  }
  // A raincoat keeps the wind out as well.
  if (windy && feelMin < 15 && !extras.includes('raincoat')) {
    extras.push('windproof');
  }
  return extras;
}

function coldExtras(feelMin: number): ClothingExtra[] {
  return [
    ...(feelMin < 5 ? (['hat'] as const) : []),
    ...(feelMin < 0 ? (['gloves', 'scarf'] as const) : []),
  ];
}

function sunExtras(uvIndexMax: number, feelMax: number): ClothingExtra[] {
  return [
    ...(uvIndexMax >= 5 ? (['sunglasses'] as const) : []),
    ...(uvIndexMax >= 6 ? (['sunscreen'] as const) : []),
    ...(uvIndexMax >= 5 && feelMax >= 25 ? (['cap'] as const) : []),
  ];
}

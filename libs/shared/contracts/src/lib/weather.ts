import { z } from 'zod';
import { LocalDate } from './local-date';

/** A place found by name: the user picks one as their location. */
export const weatherLocationSchema = z.object({
  name: z.string().trim().min(1).max(200),
  /** State or region, to tell apart places with the same name. */
  region: z.string().max(200).nullish(),
  country: z.string().max(100).nullish(),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
});
export type WeatherLocationInput = z.input<typeof weatherLocationSchema>;

export const weatherSearchQuerySchema = z.object({ q: z.string().trim().min(2).max(100) });
export type WeatherSearchQuery = z.infer<typeof weatherSearchQuerySchema>;

/** `GET /api/weather/places/at`: the place at the browser's location. */
export const weatherCoordinatesQuerySchema = z.object({
  latitude: z.coerce.number().min(-90).max(90),
  longitude: z.coerce.number().min(-180).max(180),
});
export type WeatherCoordinatesQuery = z.infer<typeof weatherCoordinatesQuerySchema>;

/**
 * How the user takes the cold, from "I freeze" (−2) to "I am always warm" (+2). The clothing
 * advice treats every step as `THERMAL_STEP_DEGREES` of extra warmth outside.
 */
export const THERMAL_FEELS = [-2, -1, 0, 1, 2] as const;
export type ThermalFeel = (typeof THERMAL_FEELS)[number];
export const THERMAL_STEP_DEGREES = 3;

/** `PUT /api/weather/preferences` */
export const weatherPreferencesSchema = z.object({
  thermalFeel: z
    .number()
    .int()
    .min(-2)
    .max(2)
    .transform((value) => value as ThermalFeel),
});
export type WeatherPreferences = z.output<typeof weatherPreferencesSchema>;

export interface WeatherLocation {
  name: string;
  region: string | null;
  country: string | null;
  latitude: number;
  longitude: number;
}

export const WEATHER_CONDITIONS = [
  'clear',
  'partly-cloudy',
  'cloudy',
  'fog',
  'drizzle',
  'rain',
  'freezing-rain',
  'showers',
  'snow',
  'snow-showers',
  'thunderstorm',
] as const;
export type WeatherCondition = (typeof WEATHER_CONDITIONS)[number];

/** The main outfit by "feels like" temperature, from the warmest clothes to the lightest. */
export const OUTFITS = [
  'heavy-winter',
  'winter',
  'warm',
  'jacket',
  'light-jacket',
  'long-sleeve',
  'summer',
  'hot',
] as const;
export type Outfit = (typeof OUTFITS)[number];

/** What to take in addition to the outfit. */
export const CLOTHING_EXTRAS = [
  'layers',
  'umbrella',
  'raincoat',
  'waterproof-shoes',
  'windproof',
  'hat',
  'gloves',
  'scarf',
  'sunglasses',
  'sunscreen',
  'cap',
] as const;
export type ClothingExtra = (typeof CLOTHING_EXTRAS)[number];

export interface ClothingAdvice {
  outfit: Outfit;
  extras: ClothingExtra[];
}

/** A day of the week ahead (the first one is today). */
export interface WeatherDay {
  date: LocalDate;
  condition: WeatherCondition;
  min: number;
  max: number;
  precipitationProbability: number;
  precipitation: number;
  windSpeedMax: number;
  clothing: ClothingAdvice;
}

/** Units: °C, km/h, mm, %. Times are local to the location, `HH:mm`. */
export interface WeatherForecast {
  location: WeatherLocation;
  now: {
    temperature: number;
    apparentTemperature: number;
    condition: WeatherCondition;
    windSpeed: number;
    isDay: boolean;
  };
  today: {
    date: LocalDate;
    condition: WeatherCondition;
    min: number;
    max: number;
    apparentMin: number;
    apparentMax: number;
    precipitationProbability: number;
    precipitation: number;
    windSpeedMax: number;
    uvIndexMax: number;
    sunrise: string;
    sunset: string;
  };
  /** Today's hours from the morning to the night. */
  hours: {
    time: string;
    temperature: number;
    apparentTemperature: number;
    condition: WeatherCondition;
    precipitationProbability: number;
  }[];
  /** What to wear during the day (see clothing advice on the backend). */
  clothing: ClothingAdvice;
  /** Seven days starting with today. */
  days: WeatherDay[];
  /** The user's setting the clothing advice was made with. */
  thermalFeel: ThermalFeel;
}

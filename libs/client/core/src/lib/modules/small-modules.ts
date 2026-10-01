import {
  BirthdayInput,
  Monitor,
  MonitorInput,
  UpcomingBirthday,
  WeatherForecast,
  WeatherLocation,
  WeatherLocationInput,
} from '@pd/contracts';
import { ApiClient, apiRequest } from '../api-client';

// Modules with a handful of requests each: birthdays, monitoring, weather.

// --- Birthdays ---

export const BIRTHDAYS_READS = {
  /** Upcoming first. */
  list: () => apiRequest('/api/birthdays'),
};

export function birthdaysApi(api: ApiClient) {
  return {
    list: () => api.read<UpcomingBirthday[]>(BIRTHDAYS_READS.list()),
    create: (input: BirthdayInput) => api.post<UpcomingBirthday>('/api/birthdays', input),
    update: (id: string, input: BirthdayInput) =>
      api.put<UpcomingBirthday>(`/api/birthdays/${id}`, input),
    remove: (id: string) => api.delete(`/api/birthdays/${id}`),
  };
}

// --- Monitoring ---

export const MONITORING_READS = {
  monitors: () => apiRequest('/api/monitoring/monitors'),
};

export function monitoringApi(api: ApiClient) {
  return {
    monitors: () => api.read<Monitor[]>(MONITORING_READS.monitors()),
    add: (input: MonitorInput) => api.post<void>('/api/monitoring/monitors', input),
    remove: (id: string) => api.delete(`/api/monitoring/monitors/${id}`),
  };
}

// --- Weather ---

export const WEATHER_READS = {
  /** Today's forecast; `null` until a location is chosen. */
  forecast: () => apiRequest('/api/weather'),
  places: (q: string) => apiRequest('/api/weather/places', { q }),
  /** The place at the device's location. */
  placeAt: (latitude: number, longitude: number) =>
    apiRequest('/api/weather/places/at', { latitude, longitude }),
};

export function weatherApi(api: ApiClient) {
  return {
    forecast: () => api.read<WeatherForecast | null>(WEATHER_READS.forecast()),
    places: (q: string) => api.read<WeatherLocation[]>(WEATHER_READS.places(q)),
    placeAt: (latitude: number, longitude: number) =>
      api.read<WeatherLocation>(WEATHER_READS.placeAt(latitude, longitude)),
    setLocation: (input: WeatherLocationInput) =>
      api.put<WeatherLocation>('/api/weather/location', input),
  };
}

export type BirthdaysClient = ReturnType<typeof birthdaysApi>;
export type MonitoringClient = ReturnType<typeof monitoringApi>;
export type WeatherClient = ReturnType<typeof weatherApi>;

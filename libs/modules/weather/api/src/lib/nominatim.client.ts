import { WeatherLocation } from '@pd/contracts';

const REVERSE_URL = 'https://nominatim.openstreetmap.org/reverse';
const TIMEOUT_MS = 10_000;
/** Nominatim asks every app to name itself (usage policy: operations.osmfoundation.org). */
const USER_AGENT = 'personal-dashboard (https://github.com/romanrostislavovich/personal-dashboard)';

interface RawReverse {
  name?: string;
  address?: {
    city?: string;
    town?: string;
    village?: string;
    municipality?: string;
    state?: string;
    country?: string;
  };
}

/**
 * Nominatim (OpenStreetMap): the place name for coordinates, without an API key.
 * Open-Meteo only searches by name, so the browser's location is named here. It is asked once,
 * when the location is detected, well within the one-request-per-second limit.
 */
export class NominatimClient {
  /** The city (or town, village) at the coordinates, in the given language. */
  async placeAt(latitude: number, longitude: number, language: string): Promise<WeatherLocation> {
    const params = new URLSearchParams({
      lat: String(latitude),
      lon: String(longitude),
      format: 'jsonv2',
      // 10 — a city: a street address is more than the forecast needs.
      zoom: '10',
      'accept-language': language,
    });
    const response = await fetch(`${REVERSE_URL}?${params}`, {
      headers: { 'user-agent': USER_AGENT },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) {
      throw new Error(`Nominatim responded ${response.status}`);
    }
    const { name, address = {} } = (await response.json()) as RawReverse;
    const place = address.city ?? address.town ?? address.village ?? address.municipality ?? name;
    return {
      name: place || `${latitude.toFixed(2)}, ${longitude.toFixed(2)}`,
      region: address.state ?? null,
      country: address.country ?? null,
      latitude,
      longitude,
    };
  }
}

/** What a place is called, as a map service tells it. */
export interface FoundPlace {
  name: string;
  /** What kind of place: `cafe`, `supermarket`, `gym`…; `null` — an address. */
  kind: string | null;
}

const TIMEOUT_MS = 15_000;
/** The public Overpass is often slow (half a minute is common); it is asked in the background. */
const OVERPASS_TIMEOUT_MS = 60_000;
/** OpenStreetMap asks every app to name itself (operations.osmfoundation.org policies). */
const USER_AGENT = 'personal-dashboard (https://github.com/romanrostislavovich/personal-dashboard)';
/** A place of interest farther than this from where the phone stood is not where it was. */
const NEAR_M = 60;
/** The tags that name a place one goes to (not a street, not a house). */
const KINDS = ['amenity', 'shop', 'leisure', 'tourism', 'office', 'sport', 'healthcare', 'craft'];

/** Things on a street one does not spend time at: a statue is no place to have been. */
const NOT_PLACES = new Set([
  'artwork',
  'information',
  'viewpoint',
  'bench',
  'waste_basket',
  'vending_machine',
  'atm',
  'parking',
  'parking_entrance',
  'bicycle_parking',
  'bicycle_rental',
  'telephone',
  'post_box',
  'toilets',
  'drinking_water',
  'recycling',
  'charging_station',
  'fountain',
  'clock',
  'shelter',
  'motorcycle_parking',
  'taxi',
  'car_sharing',
  'parcel_locker',
  'memorial',
  'board',
  'picnic_table',
]);

interface OverpassElement {
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

function distanceM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const rad = Math.PI / 180;
  const h =
    Math.sin(((lat2 - lat1) * rad) / 2) ** 2 +
    Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(((lon2 - lon1) * rad) / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.sqrt(h));
}

/**
 * OpenStreetMap, without a key: the nearest named place of interest (Overpass), else the address
 * (Nominatim). Asked only for the stays, at most one request a second (see PlaceNamesService).
 */
export class OsmPlaceClient {
  async find(latitude: number, longitude: number, language: string): Promise<FoundPlace | null> {
    // Overpass is a busy public server: when it does not answer, the address still names it.
    const poi = await this.pointOfInterest(latitude, longitude, language).catch(() => null);
    return poi ?? (await this.address(latitude, longitude, language));
  }

  private async pointOfInterest(
    latitude: number,
    longitude: number,
    language: string,
  ): Promise<FoundPlace | null> {
    // One scan for any of the kinds: a union of a query per kind takes the server much longer.
    const kinds = `^(${KINDS.join('|')})$`;
    const query =
      `[out:json][timeout:50];` +
      `nwr(around:${NEAR_M},${latitude},${longitude})[name][~"${kinds}"~"."];out center 30;`;
    const response = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      headers: { 'user-agent': USER_AGENT, 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ data: query }),
      signal: AbortSignal.timeout(OVERPASS_TIMEOUT_MS),
    });
    if (!response.ok) {
      throw new Error(`Overpass answered ${response.status}`);
    }
    const { elements = [] } = (await response.json()) as { elements?: OverpassElement[] };
    let best: { place: FoundPlace; meters: number } | null = null;
    for (const element of elements) {
      const lat = element.lat ?? element.center?.lat;
      const lon = element.lon ?? element.center?.lon;
      const tags = element.tags ?? {};
      const name = tags[`name:${language}`] ?? tags['name'];
      if (lat === undefined || lon === undefined || !name) {
        continue;
      }
      const kind = KINDS.map((key) => tags[key]).find(Boolean) ?? null;
      if (kind && NOT_PLACES.has(kind)) {
        continue;
      }
      const meters = distanceM(latitude, longitude, lat, lon);
      if (!best || meters < best.meters) {
        best = { place: { name, kind }, meters };
      }
    }
    return best?.place ?? null;
  }

  private async address(
    latitude: number,
    longitude: number,
    language: string,
  ): Promise<FoundPlace | null> {
    const params = new URLSearchParams({
      lat: String(latitude),
      lon: String(longitude),
      format: 'jsonv2',
      zoom: '18',
      'accept-language': language,
    });
    const response = await fetch(`https://nominatim.openstreetmap.org/reverse?${params}`, {
      headers: { 'user-agent': USER_AGENT },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) {
      throw new Error(`Nominatim answered ${response.status}`);
    }
    const found = (await response.json()) as {
      name?: string;
      address?: Record<string, string>;
    };
    const address = found.address ?? {};
    const street = [address['road'] ?? address['pedestrian'], address['house_number']]
      .filter(Boolean)
      .join(' ');
    const name = found.name || street || address['suburb'] || address['city'];
    return name ? { name, kind: null } : null;
  }
}

/**
 * Google Places (Nearby Search), with the user's key: the nearest place, as Google Maps knows it.
 * Asked only when the user presses "look up on Google" for a stay.
 */
export class GooglePlaceClient {
  constructor(private readonly apiKey: string) {}

  async find(latitude: number, longitude: number, language: string): Promise<FoundPlace | null> {
    const response = await fetch('https://places.googleapis.com/v1/places:searchNearby', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-goog-api-key': this.apiKey,
        'x-goog-fieldmask': 'places.displayName,places.primaryType',
      },
      body: JSON.stringify({
        locationRestriction: { circle: { center: { latitude, longitude }, radius: NEAR_M } },
        maxResultCount: 5,
        rankPreference: 'DISTANCE',
        languageCode: language,
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) {
      throw new GooglePlacesError(response.status, (await response.text()).slice(0, 300));
    }
    const { places = [] } = (await response.json()) as {
      places?: { displayName?: { text?: string }; primaryType?: string }[];
    };
    const first = places.find((place) => place.displayName?.text);
    return first?.displayName?.text
      ? { name: first.displayName.text, kind: first.primaryType ?? null }
      : null;
  }

  /** A key that works: one cheap question about any point. */
  async verify(): Promise<void> {
    await this.find(52.2297, 21.0122, 'en');
  }
}

export class GooglePlacesError extends Error {
  constructor(
    readonly status: number,
    detail: string,
  ) {
    super(`Google Places answered ${status}: ${detail}`);
  }
}

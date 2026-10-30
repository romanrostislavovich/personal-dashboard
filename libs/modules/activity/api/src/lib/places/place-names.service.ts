import {BadRequestException, Inject, Injectable, Logger} from '@nestjs/common';
import {ConfigService} from '@nestjs/config';
import {
  AppConfig,
  DB,
  Database,
  SecretsService,
  UsersService,
} from '@pd/api-core';
import {FoundPlaceName} from '@pd/contracts';
import {and, eq} from 'drizzle-orm';
import {
  GooglePlaceClient,
  GooglePlacesError,
  OsmPlaceClient,
} from './place-lookup.clients';
import {activityPlaceNames} from './places.schema';
import {distanceM, Point} from './stays';

/** A name found within this of a stay's middle names the stay. */
const SAME_PLACE_M = 100;
/** OpenStreetMap's public servers take at most one request a second. */
const OSM_GAP_MS = 1_100;
const GOOGLE_PLACES_SECRET = 'activity.google-places-key';
const GOOGLE_MAPS_SECRET = 'activity.google-maps-key';

export interface KnownName extends Point {
  id: string;
  found: FoundPlaceName;
}

function pointText(point: Point): string {
  return `${point.latitude.toFixed(6)},${point.longitude.toFixed(6)}`;
}

/**
 * The names of the places the stays were at: OpenStreetMap by itself, in the background, one
 * request a second; Google Places when the user asks for one stay and has set a key. Only the
 * stays' middles leave the server, never the routes. A sync client asks nothing: the server
 * names them and the names come with the sync.
 */
@Injectable()
export class PlaceNamesService {
  private readonly logger = new Logger(PlaceNamesService.name);
  private readonly osm = new OsmPlaceClient();
  private readonly isSyncClient: boolean;
  /** Points waiting for OpenStreetMap, one queue for the whole server. */
  private readonly queue: {userId: string; point: Point; language: string}[] =
    [];
  private readonly queued = new Set<string>();
  private running = false;

  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(ConfigService) config: AppConfig,
    private readonly secrets: SecretsService,
    private readonly users: UsersService,
  ) {
    this.isSyncClient = config.get('SYNC_MODE', {infer: true}) === 'client';
  }

  async known(userId: string): Promise<KnownName[]> {
    const rows = await this.db
      .select()
      .from(activityPlaceNames)
      .where(eq(activityPlaceNames.userId, userId));
    return rows.map(row => {
      const [latitude, longitude] = row.point.split(',').map(Number);
      return {
        id: row.id,
        latitude,
        longitude,
        found: {
          name: row.name,
          kind: row.kind,
          source: row.source as FoundPlaceName['source'],
        },
      };
    });
  }

  /** The name found nearest the point, Google's before OpenStreetMap's. */
  nameAt(point: Point, known: KnownName[]): FoundPlaceName | null {
    let best: {name: KnownName; meters: number} | null = null;
    for (const name of known) {
      const meters = distanceM(point, name);
      const better =
        !best ||
        (name.found.source === 'google' &&
          best.name.found.source !== 'google') ||
        (name.found.source === best.name.found.source && meters < best.meters);
      if (meters <= SAME_PLACE_M && better) {
        best = {name, meters};
      }
    }
    return best?.name.found ?? null;
  }

  /** The stays with no name yet go to OpenStreetMap, in the background. */
  async lookUpMissing(
    userId: string,
    stays: Point[],
    known: KnownName[],
  ): Promise<void> {
    if (this.isSyncClient) {
      return;
    }
    const language = (await this.users.findById(userId))?.locale ?? 'en';
    for (const point of stays) {
      const key = `${userId}:${point.latitude.toFixed(3)},${point.longitude.toFixed(3)}`;
      if (this.nameAt(point, known) || this.queued.has(key)) {
        continue;
      }
      this.queued.add(key);
      this.queue.push({userId, point, language});
    }
    void this.drain();
  }

  /** "Look up on Google" for one stay: the name replaces OpenStreetMap's there. */
  async lookUpOnGoogle(
    userId: string,
    point: Point,
  ): Promise<FoundPlaceName | null> {
    const key = await this.secrets.get(userId, GOOGLE_PLACES_SECRET);
    if (!key) {
      throw new BadRequestException('No Google Places key');
    }
    const language = (await this.users.findById(userId))?.locale ?? 'en';
    let found;
    try {
      found = await new GooglePlaceClient(key).find(
        point.latitude,
        point.longitude,
        language,
      );
    } catch (error) {
      if (error instanceof GooglePlacesError) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }
    if (!found) {
      return null;
    }
    await this.save(userId, point, {...found, source: 'google'});
    return {...found, source: 'google'};
  }

  /** The names an imported Google timeline knew; one already kept there is not kept twice. */
  async importNames(
    userId: string,
    names: {latitude: number; longitude: number; name: string}[],
  ) {
    const known = await this.known(userId);
    for (const {name, ...point} of names) {
      const there = this.nameAt(point, known);
      if (there?.source === 'google' && there.name === name) {
        continue;
      }
      await this.save(userId, point, {name, kind: null, source: 'google'});
      known.push({
        id: '',
        ...point,
        found: {name, kind: null, source: 'google'},
      });
    }
  }

  async googleKeys(
    userId: string,
  ): Promise<{places: boolean; mapsKey: string | null}> {
    return {
      places: await this.secrets.has(userId, GOOGLE_PLACES_SECRET),
      mapsKey: await this.secrets.get(userId, GOOGLE_MAPS_SECRET),
    };
  }

  /** The Places key is checked against Google first; the map's key is checked by the map. */
  async saveGoogleKeys(
    userId: string,
    keys: {placesKey?: string; mapsKey?: string},
  ) {
    if (keys.placesKey) {
      try {
        await new GooglePlaceClient(keys.placesKey).verify();
      } catch (error) {
        throw new BadRequestException(
          error instanceof Error
            ? error.message
            : 'Google Places did not answer',
        );
      }
      await this.secrets.set(userId, GOOGLE_PLACES_SECRET, keys.placesKey);
    }
    if (keys.mapsKey) {
      await this.secrets.set(userId, GOOGLE_MAPS_SECRET, keys.mapsKey);
    }
  }

  async removeGoogleKey(
    userId: string,
    which: 'places' | 'maps',
  ): Promise<void> {
    await this.secrets.delete(
      userId,
      which === 'places' ? GOOGLE_PLACES_SECRET : GOOGLE_MAPS_SECRET,
    );
  }

  private async drain(): Promise<void> {
    if (this.running) {
      return;
    }
    this.running = true;
    try {
      for (let item = this.queue.shift(); item; item = this.queue.shift()) {
        try {
          const found = await this.osm.find(
            item.point.latitude,
            item.point.longitude,
            item.language,
          );
          // Nothing found is kept too, as the street: asking again would find nothing again.
          await this.save(item.userId, item.point, {
            name: found?.name ?? '',
            kind: found?.kind ?? null,
            source: 'osm',
          });
        } catch (error) {
          this.logger.warn(
            `A place was not named: ${String(error).slice(0, 200)}`,
          );
        }
        await new Promise(resolve => setTimeout(resolve, OSM_GAP_MS));
      }
    } finally {
      this.running = false;
      this.queued.clear();
    }
  }

  private async save(
    userId: string,
    point: Point,
    found: FoundPlaceName,
  ): Promise<void> {
    if (found.source === 'google') {
      // Google's name for a place takes the place of the one OpenStreetMap gave it.
      const near = (await this.known(userId)).filter(
        name =>
          name.found.source === 'osm' && distanceM(point, name) <= SAME_PLACE_M,
      );
      for (const name of near) {
        await this.db
          .delete(activityPlaceNames)
          .where(
            and(
              eq(activityPlaceNames.userId, userId),
              eq(activityPlaceNames.id, name.id),
            ),
          );
      }
    }
    await this.db.insert(activityPlaceNames).values({
      userId,
      point: pointText(point),
      name: found.name,
      kind: found.kind,
      source: found.source,
    });
  }
}

import {Inject, Injectable, NotFoundException} from '@nestjs/common';
import {DB, Database, UsersService} from '@pd/api-core';
import {
  ActivityPeriod,
  HeatCell,
  addDays,
  FoundPlaceName,
  LocalDate,
  NamedPlace,
  parseLocalDate,
  PhoneLocationInput,
  PlaceInput,
  PlacesEntry,
  PlacesOverview,
  toLocalDate,
  zonedToUtc,
} from '@pd/contracts';
import {and, asc, eq, gte, lt, sql} from 'drizzle-orm';
import {activityDevices, ActivityDeviceRow} from '../activity.schema';
import {DevicesService} from '../devices.service';
import {frequentPlaces, Named, namedAt} from './frequent';
import {heatCells} from './heat';
import {activityPhoneLocations, activityPlaces} from './places.schema';
import {PlaceDayNumbers, placeDayNumbers} from './day-numbers';
import {PlaceNamesService} from './place-names.service';
import {clip, Entry, entriesOf, Fix, Point} from './stays';

const INSERT_CHUNK = 200;
/** The frequent places are the ones of this many days up to the day shown. */
const FREQUENT_DAYS = 30;
const FREQUENT_LIMIT = 10;
/** The device the imported Google Maps timeline is written under. */
const TIMELINE_DEVICE = 'Google Timeline';
/** The days read before a period for its numbers (home, new places). */
const HISTORY_DAYS = 60;
/** A day the phone told less than this about has no numbers: they would be guesses. */
export const MIN_DAY_POINTS = 8;
/** Longer periods read one fix in this many seconds (see `days`). */
const THIN_AFTER_DAYS = 2;
const THIN_SECONDS = 300;
/** Fixes read around a period: a stay that began before it still shows from its start. */
const MARGIN_MS = 6 * 3600_000;

/** One day in places: the entries, the meters of its trips, the fixes it had. */
export interface PlacesDay {
  day: LocalDate;
  /** The local midnight that starts it, ms. */
  start: number;
  entries: Entry[];
  meters: number;
  points: number;
}

/** Six digits: ten centimetres, more than any phone knows. */
function round(degrees: number): number {
  return Math.round(degrees * 1e6) / 1e6;
}

function pointOf(text: string): {latitude: number; longitude: number} {
  const [latitude, longitude] = text.split(',').map(Number);
  return {latitude, longitude};
}

function textOf(latitude: number, longitude: number): string {
  // Six digits: ten centimetres, more than any phone knows.
  return `${latitude.toFixed(6)},${longitude.toFixed(6)}`;
}

/**
 * The phone's location: the fixes the Android app sends, and what they tell — the places a day
 * was spent at and the trips between them (Activity → Places), the places named by the user.
 */
@Injectable()
export class PlacesService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly users: UsersService,
    private readonly names: PlaceNamesService,
    private readonly devices: DevicesService,
  ) {}

  async ingest(
    device: ActivityDeviceRow,
    items: PhoneLocationInput[],
  ): Promise<number> {
    const rows = items.map(item => ({
      userId: device.userId,
      deviceId: device.id,
      at: new Date(item.at),
      point: textOf(item.latitude, item.longitude),
      accuracy: item.accuracy,
    }));
    let saved = 0;
    for (let i = 0; i < rows.length; i += INSERT_CHUNK) {
      const inserted = await this.db
        .insert(activityPhoneLocations)
        .values(rows.slice(i, i + INSERT_CHUNK))
        .onConflictDoNothing()
        .returning({id: activityPhoneLocations.id});
      saved += inserted.length;
    }
    return saved;
  }

  /**
   * A batch of an imported Google Maps timeline: its fixes go to a device of their own, "Google
   * Timeline" (made on the first batch), so they never mix with the phone's; a batch sent twice
   * is written once.
   */
  async importTimeline(
    userId: string,
    locations: PhoneLocationInput[],
  ): Promise<number> {
    let [device] = await this.db
      .select()
      .from(activityDevices)
      .where(
        and(
          eq(activityDevices.userId, userId),
          eq(activityDevices.name, TIMELINE_DEVICE),
        ),
      );
    if (!device) {
      const created = await this.devices.register(userId, {
        name: TIMELINE_DEVICE,
        platform: 'android',
      });
      [device] = await this.db
        .select()
        .from(activityDevices)
        .where(eq(activityDevices.id, created.id));
    }
    return this.ingest(device, locations);
  }

  async overview(userId: string, day: LocalDate): Promise<PlacesOverview> {
    const zone = await this.zone(userId);
    const from = toLocalDate(addDays(parseLocalDate(day), 1 - FREQUENT_DAYS));
    // The day with every fix, the 30 days thinned: the frequent places need only the stays.
    const [[today], days, named, known] = await Promise.all([
      this.days(userId, {from: day, to: day}, zone),
      this.days(userId, {from, to: day}, zone),
      this.named(userId),
      this.names.known(userId),
    ]);
    const stays = days
      .flatMap(item => item.entries)
      .filter(entry => entry.kind === 'stay');
    const frequent = frequentPlaces(stays, named, FREQUENT_LIMIT);
    // The places with no name of the user's and none found yet: looked up in the background,
    // so they are named the next time the page is opened.
    const unnamed = [
      ...today.entries.filter(entry => entry.kind === 'stay'),
      ...frequent,
    ].filter(point => !namedAt(point, named));
    void this.names
      .lookUpMissing(userId, unnamed, known)
      .catch(() => undefined);
    const foundAt = (point: Point) => {
      const found = this.names.nameAt(point, known);
      return found?.name ? found : null;
    };
    return {
      day,
      entries: today.entries.map(entry => this.entry(entry, named, foundAt)),
      meters: today.meters,
      points: today.points,
      frequent: frequent.map(place => ({
        ...place,
        found: place.placeId ? null : foundAt(place),
        lastAt: new Date(place.lastAt).toISOString(),
      })),
      named,
    };
  }

  /**
   * Each day of the period in places, in the user's own days. Longer than a couple of days, one
   * fix in five minutes is read (the phone sends one a minute): a stay is ten minutes or more,
   * and a year of every fix would be half a million to decrypt.
   */
  async days(
    userId: string,
    period: ActivityPeriod,
    zone?: string,
  ): Promise<PlacesDay[]> {
    const timeZone = zone ?? (await this.zone(userId));
    const dayStarts: {day: LocalDate; start: number}[] = [];
    for (
      let day = period.from;
      day <= period.to;
      day = toLocalDate(addDays(parseLocalDate(day), 1))
    ) {
      dayStarts.push({
        day,
        start: zonedToUtc({date: day, time: '00:00'}, timeZone).getTime(),
      });
    }
    const after = toLocalDate(addDays(parseLocalDate(period.to), 1));
    const end = zonedToUtc({date: after, time: '00:00'}, timeZone).getTime();
    const step = dayStarts.length > THIN_AFTER_DAYS ? THIN_SECONDS : 0;
    const fixes = await this.fixes(
      userId,
      dayStarts[0].start - MARGIN_MS,
      end + MARGIN_MS,
      step,
    );
    const entries = entriesOf(fixes);
    return dayStarts.map(({day, start}, i) => {
      const dayEnd = dayStarts[i + 1]?.start ?? end;
      const ofDay = clip(entries, start, dayEnd);
      return {
        day,
        start,
        entries: ofDay,
        meters: ofDay.reduce(
          (sum, entry) => sum + (entry.kind === 'trip' ? entry.meters : 0),
          0,
        ),
        points: fixes.filter(fix => fix.at >= start && fix.at < dayEnd).length,
      };
    });
  }

  /**
   * The numbers of each day of the period for Links: on foot, on the way, at home, new places.
   * Read with 60 days before it: home is the place of most nights, and a place seen in them is
   * not new.
   */
  async dayNumbers(
    userId: string,
    period: ActivityPeriod,
  ): Promise<PlaceDayNumbers[]> {
    const history = toLocalDate(
      addDays(parseLocalDate(period.from), -HISTORY_DAYS),
    );
    const [days, named] = await Promise.all([
      this.days(userId, {from: history, to: period.to}),
      this.named(userId),
    ]);
    const told = new Set(
      days.filter(day => day.points >= MIN_DAY_POINTS).map(day => day.day),
    );
    return placeDayNumbers(days, named, period.from).filter(day =>
      told.has(day.day),
    );
  }

  async named(userId: string): Promise<NamedPlace[]> {
    const rows = await this.db
      .select()
      .from(activityPlaces)
      .where(eq(activityPlaces.userId, userId))
      .orderBy(asc(activityPlaces.createdAt));
    return rows.map(row => ({
      id: row.id,
      name: row.name,
      ...pointOf(row.point),
      radiusM: row.radiusM,
    }));
  }

  async addPlace(userId: string, input: PlaceInput): Promise<NamedPlace> {
    const [row] = await this.db
      .insert(activityPlaces)
      .values({
        userId,
        name: input.name,
        point: textOf(input.latitude, input.longitude),
        radiusM: input.radiusM,
      })
      .returning();
    return {
      id: row.id,
      name: row.name,
      ...pointOf(row.point),
      radiusM: row.radiusM,
    };
  }

  async renamePlace(userId: string, id: string, name: string): Promise<void> {
    const updated = await this.db
      .update(activityPlaces)
      .set({name})
      .where(and(eq(activityPlaces.userId, userId), eq(activityPlaces.id, id)))
      .returning({id: activityPlaces.id});
    if (!updated.length) {
      throw new NotFoundException('Place not found');
    }
  }

  /** The name is forgotten; the fixes stay. */
  async removePlace(userId: string, id: string): Promise<void> {
    await this.db
      .delete(activityPlaces)
      .where(and(eq(activityPlaces.userId, userId), eq(activityPlaces.id, id)));
  }

  private entry(
    entry: Entry,
    named: Named[],
    foundAt: (point: Point) => FoundPlaceName | null,
  ): PlacesEntry {
    const startedAt = new Date(entry.start).toISOString();
    const endedAt = new Date(entry.end).toISOString();
    if (entry.kind === 'trip') {
      return {
        kind: 'trip',
        startedAt,
        endedAt,
        meters: entry.meters,
        mode: entry.mode,
        path: entry.path.map(point => [
          round(point.latitude),
          round(point.longitude),
        ]),
      };
    }
    const place = namedAt(entry, named);
    return {
      kind: 'stay',
      placeId: place?.id ?? null,
      name: place?.name ?? null,
      found: place ? null : foundAt(entry),
      latitude: entry.latitude,
      longitude: entry.longitude,
      startedAt,
      endedAt,
    };
  }

  /**
   * The heat map of a period, in the user's own days: one fix in five minutes is enough for
   * where the time went (a year of every fix would be half a million to decrypt).
   */
  async heat(userId: string, period: ActivityPeriod): Promise<HeatCell[]> {
    const zone = await this.zone(userId);
    const after = toLocalDate(addDays(parseLocalDate(period.to), 1));
    const fixes = await this.fixes(
      userId,
      zonedToUtc({date: period.from, time: '00:00'}, zone).getTime(),
      zonedToUtc({date: after, time: '00:00'}, zone).getTime(),
      period.from === period.to ? 0 : THIN_SECONDS,
    );
    return heatCells(fixes);
  }

  /** Every fix between two moments (ms), oldest first. */
  fixesBetween(userId: string, from: number, to: number): Promise<Fix[]> {
    return this.fixes(userId, from, to, 0);
  }

  /** `step` — seconds: the first fix of each such stretch only; `0` — every fix. */
  private async fixes(
    userId: string,
    from: number,
    to: number,
    step: number,
  ): Promise<Fix[]> {
    const l = activityPhoneLocations;
    const columns = {at: l.at, point: l.point, accuracy: l.accuracy};
    const where = and(
      eq(l.userId, userId),
      gte(l.at, new Date(from)),
      lt(l.at, new Date(to)),
    );
    // Written in, not a parameter: PostgreSQL matches DISTINCT ON and ORDER BY by their text.
    const bucket = sql`floor(extract(epoch from ${l.at}) / ${sql.raw(String(Math.trunc(step)))})`;
    // Read through Drizzle's columns: the point is decrypted on the way.
    const rows = step
      ? await this.db
          .selectDistinctOn([bucket], columns)
          .from(l)
          .where(where)
          .orderBy(bucket, asc(l.at))
      : await this.db.select(columns).from(l).where(where).orderBy(asc(l.at));
    return rows.map(row => ({
      at: row.at.getTime(),
      ...pointOf(row.point),
      accuracy: row.accuracy,
    }));
  }

  private async zone(userId: string): Promise<string> {
    return this.users.timeZoneOf(await this.users.findById(userId));
  }
}

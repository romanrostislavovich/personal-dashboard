import {frequentPlaces, namedAt} from './frequent';
import {clip, distanceM, entriesOf, Fix, stayNow} from './stays';

const MIN = 60_000;
const HOME = {latitude: 52.2297, longitude: 21.0122};
// About 2.2 km north-east of home.
const WORK = {latitude: 52.2477, longitude: 21.0322};

function at(
  minute: number,
  place: {latitude: number; longitude: number},
  accuracy = 30,
): Fix {
  return {at: minute * MIN, ...place, accuracy};
}

/** Every 15 minutes at a place, from `from` to `to` minutes. */
function every15(
  from: number,
  to: number,
  place: {latitude: number; longitude: number},
): Fix[] {
  const fixes: Fix[] = [];
  for (let minute = from; minute <= to; minute += 15) {
    fixes.push(at(minute, place));
  }
  return fixes;
}

describe('the places of a day', () => {
  it('measures the distance on the Earth', () => {
    expect(distanceM(HOME, WORK)).toBeGreaterThan(2200);
    expect(distanceM(HOME, WORK)).toBeLessThan(2500);
    expect(distanceM(HOME, HOME)).toBe(0);
  });

  it('tells the stays and the trip between them', () => {
    const halfway = {latitude: 52.2387, longitude: 21.0222};
    const entries = entriesOf([
      ...every15(0, 60, HOME),
      at(75, halfway),
      ...every15(90, 180, WORK),
    ]);
    expect(entries.map(entry => entry.kind)).toEqual(['stay', 'trip', 'stay']);
    expect(entries[0]).toMatchObject({start: 0, end: 60 * MIN});
    expect(entries[1]).toMatchObject({start: 60 * MIN, end: 90 * MIN});
    expect(entries[2]).toMatchObject({start: 90 * MIN, end: 180 * MIN});
    const trip = entries[1];
    expect(trip.kind === 'trip' && trip.meters).toBeGreaterThan(2200);
  });

  it('a walk that comes back near the place is a trip, not part of the stay', () => {
    // A café, a walk of 40 minutes up to ~650 m away, then a bench 120 m from the café.
    const bench = {latitude: 52.2308, longitude: 21.0122};
    const walk: Fix[] = [];
    for (let minute = 32; minute <= 70; minute += 2) {
      const out = 1 - Math.abs(minute - 51) / 19; // 0 → 1 → 0
      walk.push(
        at(minute, {
          latitude: HOME.latitude + 0.006 * out,
          longitude: HOME.longitude + 0.002 * out,
        }),
      );
    }
    const entries = entriesOf([
      ...every15(0, 30, HOME),
      ...walk,
      ...every15(72, 102, bench),
    ]);
    expect(entries.map(entry => entry.kind)).toEqual(['stay', 'trip', 'stay']);
    expect(entries[1]).toMatchObject({kind: 'trip', mode: 'walk'});
    expect((entries[1] as {meters: number}).meters).toBeGreaterThan(1000);
  });

  it('passing by is no stay, and a fix gone astray is no trip', () => {
    const astray = {latitude: 52.236, longitude: 21.0122};
    const entries = entriesOf([
      ...every15(0, 60, HOME),
      at(75, astray),
      ...every15(90, 150, HOME),
    ]);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({kind: 'stay', start: 0, end: 150 * MIN});
  });

  it('a fix far from sure tells nothing', () => {
    const entries = entriesOf([
      ...every15(0, 60, HOME),
      at(70, WORK, 1500),
      ...every15(80, 120, HOME),
    ]);
    expect(entries).toHaveLength(1);
  });

  it('a short walk by GPS between two places is a trip on foot, not part of them', () => {
    // 450 m north in ten minutes, a GPS fix every 30 seconds.
    const cafe = {latitude: HOME.latitude + 0.004, longitude: HOME.longitude};
    const walk: Fix[] = [];
    for (let i = 1; i < 20; i++) {
      walk.push({
        at: (60 + i / 2) * MIN,
        latitude: HOME.latitude + (0.004 * i) / 20,
        longitude: HOME.longitude,
        accuracy: 8,
      });
    }
    const entries = entriesOf([
      ...every15(0, 60, HOME),
      ...walk,
      ...every15(70, 130, cafe),
    ]);
    expect(entries.map(entry => entry.kind)).toEqual(['stay', 'trip', 'stay']);
    const trip = entries[1];
    // The first and the last steps, within GPS reach of a place, count to it.
    expect(trip).toMatchObject({kind: 'trip', mode: 'walk'});
    expect(trip.start).toBeLessThanOrEqual(62 * MIN);
    expect(trip.end).toBeGreaterThanOrEqual(68 * MIN);
    expect(trip.kind === 'trip' && trip.path.length).toBeGreaterThan(15);
  });

  it('GPS wandering indoors is still one stay', () => {
    // At work, a GPS fix every 5 seconds for two hours, sure to 10 m yet up to 80 m off.
    const indoors: Fix[] = [];
    for (let i = 0; i < 2 * 720; i++) {
      const angle = i * 2.4;
      const meters = ((i * 37) % 80) + 1;
      indoors.push({
        at: 90 * MIN + i * 5000,
        latitude: WORK.latitude + (Math.sin(angle) * meters) / 111_000,
        longitude: WORK.longitude + (Math.cos(angle) * meters) / 68_000,
        accuracy: 10,
      });
    }
    const entries = entriesOf([...every15(0, 60, HOME), ...indoors]);
    expect(entries.map(entry => entry.kind)).toEqual(['stay', 'trip', 'stay']);
    const work = entries[2];
    expect(work.kind === 'stay' && distanceM(work, WORK)).toBeLessThan(30);
    expect(work.end - work.start).toBeGreaterThan(115 * MIN);
  });

  it('tells the stay going on now, and none once the phone has left', () => {
    const atHome = every15(0, 30, HOME);
    expect(stayNow(atHome)).toMatchObject({start: 0, end: 30 * MIN});
    // Ten minutes after: a fix far away — on the way.
    expect(stayNow([...atHome, at(40, WORK)])).toBeNull();
    // Five minutes there is not a stay yet.
    expect(stayNow([at(0, HOME), at(5, HOME)])).toBeNull();
  });

  it('a stay over midnight counts on the day by its part', () => {
    const entries = entriesOf(every15(0, 600, HOME));
    expect(clip(entries, 120 * MIN, 1440 * MIN)).toEqual([
      expect.objectContaining({kind: 'stay', start: 120 * MIN, end: 600 * MIN}),
    ]);
    expect(clip(entries, 700 * MIN, 1440 * MIN)).toEqual([]);
  });

  it('gathers the stays into places: a named one by its radius, the others around the longest', () => {
    const named = [{id: 'home', name: 'Home', radiusM: 150, ...HOME}];
    const nearWork = {latitude: 52.2478, longitude: 21.0323};
    const stays = [
      {...HOME, start: 0, end: 600 * MIN},
      {...WORK, start: 700 * MIN, end: 1200 * MIN},
      {...nearWork, start: 2000 * MIN, end: 2100 * MIN},
      {...HOME, start: 1300 * MIN, end: 1400 * MIN},
    ];
    const places = frequentPlaces(stays, named, 10);
    expect(places).toHaveLength(2);
    expect(places[0]).toMatchObject({
      placeId: 'home',
      name: 'Home',
      visits: 2,
      seconds: 700 * 60,
    });
    expect(places[1]).toMatchObject({
      placeId: null,
      visits: 2,
      seconds: 600 * 60,
      lastAt: 2100 * MIN,
    });
    expect(namedAt(WORK, named)).toBeNull();
    expect(namedAt(HOME, named)?.id).toBe('home');
  });
});

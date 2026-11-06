import {placeDayNumbers} from './day-numbers';
import {Entry} from './stays';

const H = 3_600_000;
const HOME = {latitude: 52.2297, longitude: 21.0122};
const CAFE = {latitude: 52.2477, longitude: 21.0322};
const PARK = {latitude: 52.2, longitude: 21.0};

function stay(place: typeof HOME, start: number, end: number): Entry {
  return {kind: 'stay', ...place, start, end};
}

function walk(start: number, end: number): Entry {
  return {kind: 'trip', start, end, meters: 1000, mode: 'walk', path: []};
}

describe('the numbers of a day of places', () => {
  it('finds home by the nights, counts the time there, on foot and on the way, and new places', () => {
    const day1 = 0;
    const day2 = 24 * H;
    const days = [
      {
        day: '2026-10-20',
        start: day1,
        entries: [
          stay(HOME, day1, day1 + 9 * H),
          walk(day1 + 9 * H, day1 + 10 * H),
          stay(CAFE, day1 + 10 * H, day1 + 12 * H),
        ],
      },
      {
        day: '2026-10-21',
        start: day2,
        entries: [
          stay(HOME, day2, day2 + 8 * H),
          walk(day2 + 8 * H, day2 + 8.5 * H),
          stay(CAFE, day2 + 9 * H, day2 + 10 * H),
          stay(PARK, day2 + 11 * H, day2 + 12 * H),
        ],
      },
    ];
    // The 20th is the history: the café is not new on the 21st, the park is.
    expect(placeDayNumbers(days, [], '2026-10-21')).toEqual([
      {
        day: '2026-10-21',
        walkSeconds: 1800,
        tripSeconds: 1800,
        bikeSeconds: 0,
        rideSeconds: 0,
        homeSeconds: 8 * 3600,
        newPlaces: 1,
        named: new Map(),
      },
    ]);
  });

  it('counts the rides apart and the time at each named place', () => {
    const ride: Entry = {
      kind: 'trip',
      start: 9 * H,
      end: 9.5 * H,
      meters: 15_000,
      mode: 'ride',
      path: [],
    };
    const days = [
      {
        day: '2026-10-20',
        start: 0,
        entries: [stay(HOME, 0, 9 * H), ride, stay(CAFE, 10 * H, 12 * H)],
      },
    ];
    const named = [{id: 'cafe-1', name: 'Café', ...CAFE, radiusM: 100}];
    const [day] = placeDayNumbers(days, named, '2026-10-20');
    expect(day.rideSeconds).toBe(1800);
    expect(day.bikeSeconds).toBe(0);
    expect(day.named.get('cafe-1')).toEqual({name: 'Café', seconds: 2 * 3600});
  });

  it('leaves home out of the named places: it is a number of its own', () => {
    const days = [
      {day: '2026-10-20', start: 0, entries: [stay(HOME, 0, 9 * H)]},
    ];
    const named = [{id: 'home-1', name: 'Дом', ...HOME, radiusM: 100}];
    const [day] = placeDayNumbers(days, named, '2026-10-20');
    expect(day.homeSeconds).toBe(9 * 3600);
    expect(day.named.size).toBe(0);
  });

  it('knows no home without a night', () => {
    const days = [
      {day: '2026-10-20', start: 0, entries: [stay(CAFE, 10 * H, 12 * H)]},
    ];
    expect(placeDayNumbers(days, [], '2026-10-20')[0].homeSeconds).toBeNull();
  });
});

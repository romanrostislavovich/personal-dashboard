import { placeDayNumbers } from './day-numbers';
import { Entry } from './stays';

const H = 3_600_000;
const HOME = { latitude: 52.2297, longitude: 21.0122 };
const CAFE = { latitude: 52.2477, longitude: 21.0322 };
const PARK = { latitude: 52.2, longitude: 21.0 };

function stay(place: typeof HOME, start: number, end: number): Entry {
  return { kind: 'stay', ...place, start, end };
}

function walk(start: number, end: number): Entry {
  return { kind: 'trip', start, end, meters: 1000, mode: 'walk', path: [] };
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
        homeSeconds: 8 * 3600,
        newPlaces: 1,
      },
    ]);
  });

  it('knows no home without a night', () => {
    const days = [{ day: '2026-10-20', start: 0, entries: [stay(CAFE, 10 * H, 12 * H)] }];
    expect(placeDayNumbers(days, [], '2026-10-20')[0].homeSeconds).toBeNull();
  });
});

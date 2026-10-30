import {heatCells} from './heat';

const at = (minutes: number) => Date.UTC(2026, 9, 30, 8) + minutes * 60_000;
const fix = (minutes: number, latitude: number, longitude: number) => ({
  at: at(minutes),
  latitude,
  longitude,
  accuracy: 20,
});

describe('heatCells', () => {
  it('sums the time until the next fix into ~150 m cells, the busiest first', () => {
    const cells = heatCells([
      fix(0, 52.2297, 21.0122),
      fix(5, 52.2298, 21.0123),
      fix(10, 52.2299, 21.0121),
      // An hour later, elsewhere: the gap gives the last fix ten minutes, not sixty.
      fix(70, 52.25, 21.05),
    ]);
    expect(cells).toEqual([
      {latitude: 52.22925, longitude: 21.01275, minutes: 20},
      {latitude: 52.25025, longitude: 21.05025, minutes: 10},
    ]);
  });

  it('gives nothing for no fixes', () => {
    expect(heatCells([])).toEqual([]);
  });
});

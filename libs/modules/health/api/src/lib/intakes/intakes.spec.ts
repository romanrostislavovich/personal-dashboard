import { dueTimes } from './intakes.service';

describe('dueTimes', () => {
  it('gives the times that have come within the last half an hour', () => {
    expect(dueTimes(['08:00', '14:00', '20:00'], '08:00')).toEqual(['08:00']);
    expect(dueTimes(['08:00', '14:00', '20:00'], '08:29')).toEqual(['08:00']);
    expect(dueTimes(['08:00', '14:00', '20:00'], '08:30')).toEqual([]);
    expect(dueTimes(['08:00', '14:00', '20:00'], '07:59')).toEqual([]);
  });

  it('gives two times close to each other at once', () => {
    expect(dueTimes(['21:00', '21:15'], '21:20')).toEqual(['21:00', '21:15']);
  });
});

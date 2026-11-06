import {
  DayMoments,
  dayIndices,
  IndexSpan,
  isDraining,
  spreadOf,
  usualBedtime,
} from './day-indices';

const MIN = 60_000;
const H = 60 * MIN;
const START = Date.UTC(2026, 10, 2);
const at = (hours: number) => START + hours * H;

function span(
  device: IndexSpan['device'],
  app: string,
  category: IndexSpan['category'],
  from: number,
  minutes: number,
): IndexSpan {
  return {device, app, category, start: from, end: from + minutes * MIN};
}

function day(more: Partial<DayMoments>): DayMoments {
  return {
    start: START,
    end: START + 24 * H,
    spans: [],
    unlocks: [],
    notifications: [],
    focus: [],
    bedtime: null,
    ...more,
  };
}

describe('dayIndices', () => {
  it('finds deep work: 25+ minutes of work apps, cut by a notification', () => {
    const indices = dayIndices(
      day({
        spans: [
          span('computer', 'code', 'development', at(10), 30),
          span('computer', 'word', 'office', at(10.5), 30),
          span('computer', 'code', 'development', at(14), 40),
        ],
        // In the middle of the afternoon block: two halves of 20 minutes, neither deep.
        notifications: [at(14) + 20 * MIN],
      }),
    );
    expect(indices.get('deepWork')).toBe(1);
    expect(indices.get('deepWorkLongest')).toBe(60);
  });

  it('counts the restless phone: unlocks per hour of use and mere checks', () => {
    const indices = dayIndices(
      day({
        spans: [
          span('phone', 'org.telegram.messenger', 'communication', at(9), 30),
        ],
        unlocks: [at(9), at(12), at(15), at(18)],
      }),
    );
    expect(indices.get('phone.restlessness')).toBe(8);
    // Only the 09:00 unlock was followed by use.
    expect(indices.get('phone.shortSessions')).toBe(75);
  });

  it('tells draining from nourishing time, and the feeds of the morning', () => {
    const indices = dayIndices(
      day({
        spans: [
          span('phone', 'com.instagram.android', 'other', at(8), 30),
          span('browser', 'www.reddit.com', 'browsing', at(20), 30),
          span('computer', 'code', 'development', at(10), 60),
        ],
        unlocks: [at(7.5)],
      }),
    );
    expect(indices.get('draining')).toBe(1);
    expect(indices.get('nourishing')).toBe(1);
    expect(indices.get('morningDraining')).toBe(30);
    expect(indices.get('firstWork')).toBe(150);
  });

  it('counts the late night from 23:00 and entertainment after the usual bedtime', () => {
    const indices = dayIndices(
      day({
        spans: [
          span('phone', 'com.zhiliaoapp.musically', 'media', at(23), 60),
          span('computer', 'steam', 'games', at(24.5), 30),
        ],
        bedtime: 23.5,
      }),
    );
    expect(indices.get('lateNight')).toBe(1.5);
    expect(indices.get('afterBedtime')).toBe(60);
  });

  it('finds the longest daytime stretch with no screen', () => {
    const indices = dayIndices(
      day({
        spans: [
          span('phone', 'x', 'other', at(9), 60),
          span('computer', 'code', 'development', at(14), 60),
        ],
      }),
    );
    // 10:00–14:00 empty; 15:00–22:00 is longer.
    expect(indices.get('offline')).toBe(7);
  });

  it('counts no offline stretch before the day is over: the afternoon is not lived yet', () => {
    const indices = dayIndices(
      day({
        spans: [span('phone', 'x', 'other', at(9), 60)],
        now: at(15),
      }),
    );
    expect(indices.has('offline')).toBe(false);
  });

  it('says nothing of what it has no data for', () => {
    expect([...dayIndices(day({})).keys()]).toEqual([]);
  });
});

describe('the helpers', () => {
  it('knows the draining apps and sites', () => {
    expect(isDraining('com.instagram.android')).toBe(true);
    expect(isDraining('m.facebook.com')).toBe(true);
    expect(isDraining('youtube.com')).toBe(false);
  });

  it('gives the spread and the median bedtime when enough is known', () => {
    expect(spreadOf([23, 23, 23])).toBeNull();
    expect(spreadOf([23, 25, 23, 25])).toBe(1);
    expect(usualBedtime([23, 24, 25, 23.5, 24.5])).toBe(24);
    expect(usualBedtime([23])).toBeNull();
  });
});

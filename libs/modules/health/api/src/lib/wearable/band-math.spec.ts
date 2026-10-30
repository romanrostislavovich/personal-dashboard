import {
  combinedStress,
  dayStress,
  hourlyStress,
  lowestRollingMean,
  Minute,
  minuteStress,
  nightStress,
  reactions,
  resilience,
  restingHeartRate,
  restMinutes,
  sleepScore,
  stageMinutes,
} from './band-math';

const MIN = 60_000;
const T0 = Date.parse('2026-10-29T10:00:00Z');
const minutes = (
  count: number,
  bpm: (i: number) => number | null,
  steps = () => 0,
): Minute[] =>
  Array.from({length: count}, (_, i) => ({
    at: T0 + i * MIN,
    bpm: bpm(i),
    steps: steps(),
  }));

describe('the band’s numbers', () => {
  it('takes a minute as at rest only after five minutes without steps, out of exercise and sleep', () => {
    const day = minutes(20, () => 70);
    day[3].steps = 40;
    const rest = restMinutes(
      day,
      [{start: T0 + 15 * MIN, end: T0 + 17 * MIN}],
      [],
    );
    const at = rest.map(m => (m.at - T0) / MIN);
    expect(at).toEqual([0, 1, 2, 9, 10, 11, 12, 13, 14, 17, 18, 19]);
  });

  it('finds the resting pulse in the lowest half-hour of the night, else in the day', () => {
    const night = minutes(60, i => (i >= 20 && i < 50 ? 52 : 60));
    expect(restingHeartRate(night, [])).toBe(52);
    expect(
      restingHeartRate(
        [],
        minutes(100, i => 60 + (i % 10)),
      ),
    ).toBe(61);
    expect(
      restingHeartRate(
        [],
        minutes(30, () => 60),
      ),
    ).toBeNull();
    // A gap breaks the run: two half-hours do not make one.
    const broken = [
      ...minutes(20, () => 50),
      ...minutes(20, () => 50).map(m => ({...m, at: m.at + 60 * MIN})),
    ];
    expect(lowestRollingMean(broken, 30)).toBeNull();
  });

  it('scales the pulse above the usual one at rest to 0–100', () => {
    expect(minuteStress(56, 60)).toBe(0);
    expect(minuteStress(60, 60)).toBe(25);
    expect(minuteStress(67.2, 60)).toBe(60);
    expect(minuteStress(75, 60)).toBe(85);
    expect(minuteStress(90, 60)).toBe(100);
  });

  it('counts an hour only with enough minutes at rest, and the day by them', () => {
    const hours = hourlyStress(
      minutes(69, i => (i < 60 ? 60 : 75)),
      60,
    );
    expect(hours).toEqual([{at: T0, score: 25, restMinutes: 60}]);
    expect(
      dayStress([
        {score: 20, restMinutes: 30},
        {score: 80, restMinutes: 10},
      ]),
    ).toBe(35);
    expect(dayStress([])).toBeNull();
  });

  it('finds a reaction in a run of high minutes, short gaps allowed', () => {
    const day = minutes(30, i => (i >= 5 && i < 12 && i !== 8 ? 90 : 62));
    const found = reactions(day, 60);
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({
      start: T0 + 5 * MIN,
      end: T0 + 12 * MIN,
      peakBpm: 90,
    });
    // Four high minutes are not a reaction.
    expect(
      reactions(
        minutes(10, i => (i < 4 ? 90 : 60)),
        60,
      ),
    ).toEqual([]);
  });

  it('scores a night by its length, stages and calm', () => {
    const stages = stageMinutes([
      {start: 0, end: 60 * MIN, stage: 'light'},
      {start: 60 * MIN, end: 150 * MIN, stage: 'deep'},
      {start: 150 * MIN, end: 160 * MIN, stage: 'awake'},
      {start: 160 * MIN, end: 250 * MIN, stage: 'rem'},
      {start: 250 * MIN, end: 260 * MIN, stage: 'out'},
      {start: 260 * MIN, end: 470 * MIN, stage: 'light'},
    ]);
    expect(stages).toEqual({
      asleep: 450,
      deep: 90,
      rem: 90,
      light: 270,
      awake: 10,
    });
    expect(sleepScore(stages, 54, 60)).toBe(
      50 + 25 + Math.round(12.5 * (5 / 6) + 12.5),
    );
    expect(
      sleepScore({asleep: 30, deep: 0, rem: 0, awake: 0}, null, null),
    ).toBeNull();
  });

  it('reads the night against the owner’s own baselines', () => {
    const history = {hrv: [40, 42, 38, 41, 39], resting: [58, 60, 59, 61, 60]};
    expect(nightStress(40, 60, history)).toBe(50);
    expect(nightStress(30, 66, history)!).toBeGreaterThan(80);
    expect(nightStress(40, 60, {hrv: [40], resting: []})).toBeNull();
  });

  it('weighs the day and the night, and resilience as recovery against load', () => {
    expect(combinedStress(40, 60)).toBe(48);
    expect(combinedStress(null, 60)).toBe(60);
    expect(resilience(80, 40, 40)).toBe(65);
    expect(resilience(null, null, 40)).toBeNull();
    expect(resilience(80, null, null)).toBeNull();
  });
});

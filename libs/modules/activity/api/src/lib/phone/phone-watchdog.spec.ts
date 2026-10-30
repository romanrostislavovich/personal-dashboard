import {judgePhone, PhoneWatch} from './phone-watchdog';

const NOW = new Date('2026-10-30T18:00:00Z');
const ago = (hours: number) => new Date(NOW.getTime() - hours * 3_600_000);

const healthy: PhoneWatch = {
  collectedAt: ago(0.2),
  healthAllowed: true,
  healthNewestAt: ago(1),
  locationAllowed: true,
  lastFixAt: ago(2),
  revivedAt: null,
  told: {},
};

describe('judgePhone', () => {
  it('leaves a phone that sends everything alone', () => {
    expect(judgePhone(healthy, NOW)).toEqual({
      revive: false,
      tell: [],
      told: {},
    });
  });

  it('wakes a phone whose collection stopped, at most hourly', () => {
    const stopped = {...healthy, collectedAt: ago(3)};
    expect(judgePhone(stopped, NOW).revive).toBe(true);
    expect(judgePhone({...stopped, revivedAt: ago(0.5)}, NOW).revive).toBe(
      false,
    );
    expect(judgePhone({...stopped, revivedAt: ago(1.5)}, NOW).revive).toBe(
      true,
    );
  });

  it('judges the band only while the collection runs: a quiet collection says it all', () => {
    const verdict = judgePhone(
      {...healthy, collectedAt: ago(30), healthNewestAt: ago(30)},
      NOW,
    );
    expect(verdict.tell.map(t => t.stream)).toEqual(['collection']);
  });

  it('wakes for a quiet band, and tells of it once after a day', () => {
    const quiet = {...healthy, healthNewestAt: ago(25)};
    const first = judgePhone(quiet, NOW);
    expect(first.revive).toBe(true);
    expect(first.tell).toEqual([{stream: 'band', since: ago(25)}]);
    const again = judgePhone({...quiet, told: first.told}, NOW);
    expect(again.tell).toEqual([]);
    // Data came, and a new silence later is told anew.
    expect(
      judgePhone({...quiet, healthNewestAt: ago(1), told: first.told}, NOW)
        .told,
    ).toEqual({});
  });

  it('gives a still phone half a day without places, and skips what is not allowed', () => {
    expect(judgePhone({...healthy, lastFixAt: ago(8)}, NOW).revive).toBe(false);
    expect(judgePhone({...healthy, lastFixAt: ago(13)}, NOW).revive).toBe(true);
    expect(
      judgePhone({...healthy, locationAllowed: false, lastFixAt: ago(40)}, NOW)
        .revive,
    ).toBe(false);
  });
});

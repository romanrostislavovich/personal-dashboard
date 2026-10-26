import {
  GoogleHealthAuthError,
  GoogleHealthClient,
  parseDaily,
  parseHeartRate,
  parseSleep,
  parseSteps,
  parseZoneMinutes,
} from './google-health.client';

/** The shapes are those of developers.google.com/health/reference/rest/v4 (October 2026). */
const day = (d: number) => ({ date: { year: 2026, month: 10, day: d } });

describe('Google Health answers', () => {
  it('reads a roll-up per day and leaves a day without data out (not a zero)', () => {
    const steps = parseSteps([
      { civilStartTime: day(20), steps: { countSum: '8412' } },
      { civilStartTime: day(21) },
    ]);
    expect([...steps]).toEqual([['2026-10-20', { steps: 8412 }]]);
    expect(
      parseHeartRate([
        { civilStartTime: day(20), heartRate: { beatsPerMinuteAvg: 71.6, beatsPerMinuteMax: 151 } },
      ]).get('2026-10-20'),
    ).toEqual({
      heartRateAvg: 72,
      heartRateMax: 151,
    });
    expect(
      parseZoneMinutes([
        {
          civilStartTime: day(20),
          activeZoneMinutes: {
            sumInFatBurnHeartZone: '20',
            sumInCardioHeartZone: '7',
            sumInPeakHeartZone: '1',
          },
        },
      ]).get('2026-10-20'),
    ).toEqual({ activeZoneMinutes: 28 });
  });

  it('reads the daily summaries by their own date', () => {
    const days = parseDaily([
      { dailyRestingHeartRate: { date: day(20).date, beatsPerMinute: '58' } },
      {
        dailyHeartRateVariability: {
          date: day(20).date,
          averageHeartRateVariabilityMilliseconds: 41.27,
        },
      },
      { dailyOxygenSaturation: { date: day(21).date, averagePercentage: 96.04 } },
    ]);
    expect(days.get('2026-10-20')).toEqual({ restingHeartRate: 58, hrvMs: 41.3 });
    expect(days.get('2026-10-21')).toEqual({ spo2: 96 });
  });

  it('takes the longest sleep that ended a day, with its stages and times', () => {
    const night = {
      sleep: {
        type: 'STAGES' as const,
        interval: {
          civilStartTime: { date: day(19).date, time: { hours: 23, minutes: 40 } },
          civilEndTime: { date: day(20).date, time: { hours: 7, minutes: 5 } },
        },
        summary: {
          minutesAsleep: '402',
          minutesAwake: '43',
          stagesSummary: [
            { type: 'DEEP', minutes: '71' },
            { type: 'REM', minutes: '95' },
            { type: 'LIGHT', minutes: '236' },
            { type: 'AWAKE', minutes: '43' },
          ],
        },
      },
    };
    const nap = {
      sleep: {
        type: 'CLASSIC' as const,
        interval: {
          civilStartTime: { date: day(20).date, time: { hours: 15 } },
          civilEndTime: { date: day(20).date, time: { hours: 15, minutes: 40 } },
        },
        summary: { minutesAsleep: '35', stagesSummary: [{ type: 'ASLEEP', minutes: '35' }] },
      },
    };
    expect(parseSleep([nap, night]).get('2026-10-20')).toEqual({
      sleepMinutes: 402,
      deepMinutes: 71,
      remMinutes: 95,
      lightMinutes: 236,
      awakeMinutes: 43,
      sleepStart: '23:40',
      sleepEnd: '07:05',
    });
  });
});

describe('GoogleHealthClient', () => {
  const client = new GoogleHealthClient('id.apps.googleusercontent.com', 'secret', 'https://x/cb');
  const fetchMock = vi.fn();

  beforeEach(() => vi.stubGlobal('fetch', fetchMock));
  afterEach(() => {
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  it('asks for offline, read-only access', () => {
    const url = new URL(client.authorizeUrl('state1'));
    expect(url.searchParams.get('access_type')).toBe('offline');
    expect(url.searchParams.get('scope')).toContain('googlehealth.sleep.readonly');
    expect(url.searchParams.get('scope')).not.toContain('writeonly');
  });

  it('merges every kind into days, skips a kind not allowed, and asks the end day exclusive', async () => {
    fetchMock.mockImplementation(async (url: string, init: RequestInit) => {
      if (url.includes('/steps/')) {
        expect(JSON.parse(init.body as string).range).toEqual({
          start: { date: { year: 2026, month: 10, day: 20 } },
          end: { date: { year: 2026, month: 10, day: 22 } },
        });
        return Response.json({
          rollupDataPoints: [{ civilStartTime: day(21), steps: { countSum: '5000' } }],
        });
      }
      if (url.includes('/daily-resting-heart-rate/')) {
        expect(new URL(url).searchParams.get('filter')).toBe(
          'dailyRestingHeartRate.date >= "2026-10-20" AND dailyRestingHeartRate.date < "2026-10-22"',
        );
        return Response.json({
          dataPoints: [{ dailyRestingHeartRate: { date: day(21).date, beatsPerMinute: '60' } }],
        });
      }
      if (url.includes('/sleep/')) {
        return new Response('{}', { status: 403 });
      }
      return Response.json({});
    });
    const days = await client.days('token', '2026-10-20', '2026-10-21');
    expect(days.get('2026-10-21')).toEqual({ steps: 5000, restingHeartRate: 60 });
  });

  it('tells an expired token apart from other failures', async () => {
    fetchMock.mockResolvedValue(new Response('', { status: 401 }));
    await expect(client.days('token', '2026-10-20', '2026-10-20')).rejects.toBeInstanceOf(
      GoogleHealthAuthError,
    );
  });
});

import {fetchWithTimeout} from '@pd/api-core';
import {WearableDay} from '@pd/contracts';

const AUTH = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN = 'https://oauth2.googleapis.com/token';
const API = 'https://health.googleapis.com/v4/users/me/dataTypes';

/** Read-only: activity, the heart and SpO2, sleep. */
const SCOPES = [
  'activity_and_fitness.readonly',
  'health_metrics_and_measurements.readonly',
  'sleep.readonly',
].map(scope => `https://www.googleapis.com/auth/googlehealth.${scope}`);

/** Google lets a heart-rate or calories roll-up cover at most 14 days. */
export const MAX_RANGE_DAYS = 14;
/** Sleep comes at most 25 nights a page. */
const SLEEP_PAGE = 25;

export interface GoogleTokens {
  accessToken: string;
  /** Google sends a refresh token on the first consent only. */
  refreshToken: string | null;
  expiresAt: Date;
}

/** The consent was revoked or ran out (a Google app in "Testing" gives 7 days). */
export class GoogleHealthAuthError extends Error {}

/** A part of a day, as one number per day: `day` → the field of WearableDay it fills. */
export type DayNumbers = Map<string, Partial<WearableDay>>;

/**
 * OAuth (Authorization Code flow with offline access) and the day numbers of the band.
 * The answers' shapes are those of developers.google.com/health/reference/rest/v4.
 */
export class GoogleHealthClient {
  constructor(
    private readonly clientId: string,
    private readonly clientSecret: string,
    private readonly redirectUri: string,
  ) {}

  authorizeUrl(state: string): string {
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      scope: SCOPES.join(' '),
      access_type: 'offline',
      // Without it a second sign-in gives no refresh token.
      prompt: 'consent',
      include_granted_scopes: 'true',
      state,
    });
    return `${AUTH}?${params}`;
  }

  exchangeCode(code: string): Promise<GoogleTokens> {
    return this.requestToken({
      grant_type: 'authorization_code',
      code,
      redirect_uri: this.redirectUri,
    });
  }

  refresh(refreshToken: string): Promise<GoogleTokens> {
    return this.requestToken({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    });
  }

  /**
   * Every number of the days from `from` to `to` (both included, at most MAX_RANGE_DAYS).
   * Each kind of data is asked on its own; one the user did not allow is skipped.
   */
  async days(token: string, from: string, to: string): Promise<DayNumbers> {
    const end = nextDay(to);
    const parts = await Promise.all([
      this.rollUp(token, 'steps', from, end, parseSteps),
      this.rollUp(token, 'total-calories', from, end, parseCalories),
      this.rollUp(token, 'distance', from, end, parseDistance),
      this.rollUp(token, 'active-zone-minutes', from, end, parseZoneMinutes),
      this.rollUp(token, 'heart-rate', from, end, parseHeartRate),
      this.daily(
        token,
        'daily-resting-heart-rate',
        'dailyRestingHeartRate',
        from,
        end,
      ),
      this.daily(
        token,
        'daily-heart-rate-variability',
        'dailyHeartRateVariability',
        from,
        end,
      ),
      this.daily(
        token,
        'daily-oxygen-saturation',
        'dailyOxygenSaturation',
        from,
        end,
      ),
      this.sleep(token, from, end),
    ]);
    const days: DayNumbers = new Map();
    for (const part of parts) {
      for (const [day, numbers] of part) {
        days.set(day, {...days.get(day), ...numbers});
      }
    }
    return days;
  }

  private async rollUp(
    token: string,
    type: string,
    from: string,
    end: string,
    parse: (points: RawRollup[]) => DayNumbers,
  ): Promise<DayNumbers> {
    const data = await this.request<{rollupDataPoints?: RawRollup[]}>(
      token,
      `${API}/${type}/dataPoints:dailyRollUp`,
      {
        method: 'POST',
        body: JSON.stringify({range: {start: civil(from), end: civil(end)}}),
      },
    );
    return data ? parse(data.rollupDataPoints ?? []) : new Map();
  }

  /** The daily summaries (resting heart rate, HRV, SpO2), filtered by their date. */
  private async daily(
    token: string,
    type: string,
    field:
      | 'dailyRestingHeartRate'
      | 'dailyHeartRateVariability'
      | 'dailyOxygenSaturation',
    from: string,
    end: string,
  ): Promise<DayNumbers> {
    const filter = `${field}.date >= "${from}" AND ${field}.date < "${end}"`;
    const points = await this.list(token, type, filter);
    return parseDaily(points);
  }

  private async sleep(
    token: string,
    from: string,
    end: string,
  ): Promise<DayNumbers> {
    const filter = `sleep.interval.civil_end_time >= "${from}" AND sleep.interval.civil_end_time < "${end}"`;
    return parseSleep(await this.list(token, 'sleep', filter, SLEEP_PAGE));
  }

  private async list(
    token: string,
    type: string,
    filter: string,
    pageSize?: number,
  ): Promise<RawDataPoint[]> {
    const points: RawDataPoint[] = [];
    let pageToken = '';
    do {
      const params = new URLSearchParams({filter});
      if (pageSize) {
        params.set('pageSize', String(pageSize));
      }
      if (pageToken) {
        params.set('pageToken', pageToken);
      }
      const data = await this.request<{
        dataPoints?: RawDataPoint[];
        nextPageToken?: string;
      }>(token, `${API}/${type}/dataPoints?${params}`, {method: 'GET'});
      if (!data) {
        return points;
      }
      points.push(...(data.dataPoints ?? []));
      pageToken = data.nextPageToken ?? '';
    } while (pageToken);
    return points;
  }

  /** `null` — the user did not allow this kind of data (403), so there is none to read. */
  private async request<T>(
    token: string,
    url: string,
    init: RequestInit,
  ): Promise<T | null> {
    const response = await fetchWithTimeout(url, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });
    if (response.status === 401) {
      throw new GoogleHealthAuthError('Google Health access token expired');
    }
    if (response.status === 403) {
      return null;
    }
    if (!response.ok) {
      throw new Error(
        `Google Health API ${response.status}: ${(await response.text()).slice(0, 300)}`,
      );
    }
    return (await response.json()) as T;
  }

  private async requestToken(
    body: Record<string, string>,
  ): Promise<GoogleTokens> {
    const response = await fetchWithTimeout(TOKEN, {
      method: 'POST',
      headers: {'Content-Type': 'application/x-www-form-urlencoded'},
      body: new URLSearchParams({
        ...body,
        client_id: this.clientId,
        client_secret: this.clientSecret,
      }),
    });
    if (response.status === 400 || response.status === 401) {
      throw new GoogleHealthAuthError(
        `Google token request failed: ${await response.text()}`,
      );
    }
    if (!response.ok) {
      throw new Error(`Google OAuth ${response.status}`);
    }
    const data = (await response.json()) as RawToken;
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token ?? null,
      expiresAt: new Date(Date.now() + data.expires_in * 1000),
    };
  }
}

// --- the answers, read into day numbers (pure, tested on the documented shapes) ---

export function parseSteps(points: RawRollup[]): DayNumbers {
  return byDay(points, point =>
    numberOf(point.steps?.countSum, steps => ({steps})),
  );
}

export function parseCalories(points: RawRollup[]): DayNumbers {
  return byDay(points, point =>
    numberOf(point.totalCalories?.kcalSum, kcal => ({
      calories: Math.round(kcal),
    })),
  );
}

export function parseDistance(points: RawRollup[]): DayNumbers {
  return byDay(points, point =>
    numberOf(point.distance?.millimetersSum, mm => ({
      distanceKm: Math.round(mm / 10_000) / 100,
    })),
  );
}

export function parseZoneMinutes(points: RawRollup[]): DayNumbers {
  return byDay(points, point => {
    const zones = point.activeZoneMinutes;
    if (!zones) {
      return null;
    }
    const minutes =
      Number(zones.sumInFatBurnHeartZone ?? 0) +
      Number(zones.sumInCardioHeartZone ?? 0) +
      Number(zones.sumInPeakHeartZone ?? 0);
    return {activeZoneMinutes: minutes};
  });
}

export function parseHeartRate(points: RawRollup[]): DayNumbers {
  return byDay(points, point => {
    const rate = point.heartRate;
    if (rate?.beatsPerMinuteAvg === undefined) {
      return null;
    }
    return {
      heartRateAvg: Math.round(rate.beatsPerMinuteAvg),
      heartRateMax:
        rate.beatsPerMinuteMax === undefined
          ? null
          : Math.round(rate.beatsPerMinuteMax),
    };
  });
}

/** Resting heart rate, HRV and SpO2: each a summary of its own date. */
export function parseDaily(points: RawDataPoint[]): DayNumbers {
  const days: DayNumbers = new Map();
  const put = (date: RawDate | undefined, numbers: Partial<WearableDay>) => {
    if (date) {
      const day = dayOf(date);
      days.set(day, {...days.get(day), ...numbers});
    }
  };
  for (const point of points) {
    const resting = point.dailyRestingHeartRate;
    if (resting?.beatsPerMinute !== undefined) {
      put(resting.date, {restingHeartRate: Number(resting.beatsPerMinute)});
    }
    const hrv = point.dailyHeartRateVariability;
    if (hrv?.averageHeartRateVariabilityMilliseconds !== undefined) {
      put(hrv.date, {
        hrvMs:
          Math.round(hrv.averageHeartRateVariabilityMilliseconds * 10) / 10,
      });
    }
    const oxygen = point.dailyOxygenSaturation;
    if (oxygen?.averagePercentage !== undefined) {
      put(oxygen.date, {spo2: Math.round(oxygen.averagePercentage * 10) / 10});
    }
  }
  return days;
}

/**
 * The main sleep of each day — the longest one that ended that day (a nap is left out) — with
 * its stages. "Asleep" of a band without stages counts as light sleep.
 */
export function parseSleep(points: RawDataPoint[]): DayNumbers {
  const longest = new Map<
    string,
    {asleep: number; numbers: Partial<WearableDay>}
  >();
  for (const point of points) {
    const sleep = point.sleep;
    const end = sleep?.interval?.civilEndTime;
    if (!sleep || !end?.date) {
      continue;
    }
    const minutes = (type: string) =>
      (sleep.summary?.stagesSummary ?? [])
        .filter(stage => stage.type === type)
        .reduce((sum, stage) => sum + Number(stage.minutes ?? 0), 0);
    const asleep = Number(sleep.summary?.minutesAsleep ?? 0);
    const day = dayOf(end.date);
    if ((longest.get(day)?.asleep ?? -1) >= asleep) {
      continue;
    }
    const staged = sleep.type === 'STAGES';
    longest.set(day, {
      asleep,
      numbers: {
        sleepMinutes: asleep,
        deepMinutes: staged ? minutes('DEEP') : null,
        remMinutes: staged ? minutes('REM') : null,
        lightMinutes: staged
          ? minutes('LIGHT')
          : minutes('ASLEEP') + minutes('RESTLESS') || null,
        awakeMinutes:
          Number(sleep.summary?.minutesAwake ?? 0) || minutes('AWAKE'),
        sleepStart: clockOf(sleep.interval?.civilStartTime),
        sleepEnd: clockOf(end),
      },
    });
  }
  return new Map([...longest].map(([day, {numbers}]) => [day, numbers]));
}

function byDay(
  points: RawRollup[],
  read: (point: RawRollup) => Partial<WearableDay> | null,
): DayNumbers {
  const days: DayNumbers = new Map();
  for (const point of points) {
    const numbers = read(point);
    if (numbers && point.civilStartTime?.date) {
      days.set(dayOf(point.civilStartTime.date), numbers);
    }
  }
  return days;
}

/** An unset value is "not worn", never a zero (Google: unset — no on-wrist data). */
function numberOf(
  value: string | number | undefined,
  make: (n: number) => Partial<WearableDay>,
): Partial<WearableDay> | null {
  return value === undefined || value === null ? null : make(Number(value));
}

export function dayOf(date: RawDate): string {
  return `${date.year}-${pad(date.month)}-${pad(date.day)}`;
}

function clockOf(time: RawCivilDateTime | undefined): string | null {
  return time?.date
    ? `${pad(time.time?.hours ?? 0)}:${pad(time.time?.minutes ?? 0)}`
    : null;
}

/** A day as Google's civil date-time: midnight of that day. */
function civil(day: string): RawCivilDateTime {
  const [year, month, date] = day.split('-').map(Number);
  return {date: {year, month, day: date}};
}

export function nextDay(day: string): string {
  const next = new Date(`${day}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  return next.toISOString().slice(0, 10);
}

const pad = (n: number) => String(n).padStart(2, '0');

interface RawToken {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
}

interface RawDate {
  year: number;
  month: number;
  day: number;
}

interface RawCivilDateTime {
  date?: RawDate;
  time?: {hours?: number; minutes?: number};
}

export interface RawRollup {
  civilStartTime?: RawCivilDateTime;
  civilEndTime?: RawCivilDateTime;
  steps?: {countSum?: string};
  totalCalories?: {kcalSum?: number};
  distance?: {millimetersSum?: string};
  activeZoneMinutes?: {
    sumInFatBurnHeartZone?: string;
    sumInCardioHeartZone?: string;
    sumInPeakHeartZone?: string;
  };
  heartRate?: {
    beatsPerMinuteAvg?: number;
    beatsPerMinuteMax?: number;
    beatsPerMinuteMin?: number;
  };
}

export interface RawDataPoint {
  dailyRestingHeartRate?: {date?: RawDate; beatsPerMinute?: string};
  dailyHeartRateVariability?: {
    date?: RawDate;
    averageHeartRateVariabilityMilliseconds?: number;
  };
  dailyOxygenSaturation?: {date?: RawDate; averagePercentage?: number};
  sleep?: {
    type?: 'CLASSIC' | 'STAGES';
    interval?: {
      civilStartTime?: RawCivilDateTime;
      civilEndTime?: RawCivilDateTime;
    };
    summary?: {
      minutesAsleep?: string;
      minutesAwake?: string;
      stagesSummary?: {type?: string; minutes?: string}[];
    };
  };
}

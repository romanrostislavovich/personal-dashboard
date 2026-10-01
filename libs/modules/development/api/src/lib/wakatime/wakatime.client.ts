import { LocalDate, WakatimeBreakdown } from '@pd/contracts';

const API = 'https://wakatime.com/api/v1';

export class WakatimeAuthError extends Error {}
/** The plan does not give this much history (free accounts see only the latest days). */
export class WakatimePlanError extends Error {}

export interface WakatimeSummaryDay {
  day: LocalDate;
  totalSeconds: number;
  breakdown: { kind: WakatimeBreakdown; name: string; seconds: number }[];
}

/** Fields of a WakaTime summary and the breakdown each is saved as. */
const BREAKDOWN_FIELDS: [keyof RawSummary, WakatimeBreakdown][] = [
  ['projects', 'project'],
  ['languages', 'language'],
  ['editors', 'editor'],
  ['operating_systems', 'os'],
  ['categories', 'category'],
  ['machines', 'machine'],
];

/** Minimal WakaTime API client — only what the module needs. */
export class WakatimeClient {
  constructor(private readonly apiKey: string) {}

  /** Key check: returns the account's name. */
  async getUsername(): Promise<string> {
    const { data } = await this.get<{ data: { username: string | null; display_name: string } }>(
      '/users/current',
    );
    return data.username ?? data.display_name;
  }

  /** Coding time of every day in the range (both ends included), in the account's time zone. */
  async getSummaries(start: LocalDate, end: LocalDate): Promise<WakatimeSummaryDay[]> {
    const { data } = await this.get<{ data: RawSummary[] }>(
      `/users/current/summaries?start=${start}&end=${end}`,
    );
    return data.map(parseSummary);
  }

  private async get<T>(path: string): Promise<T> {
    const response = await fetch(API + path, {
      headers: {
        // The API key goes as the user name of HTTP Basic auth.
        Authorization: `Basic ${Buffer.from(this.apiKey).toString('base64')}`,
        'User-Agent': 'personal-dashboard',
      },
    });
    if (response.status === 401) {
      throw new WakatimeAuthError('WakaTime API key is invalid');
    }
    if (response.status === 402 || response.status === 403) {
      throw new WakatimePlanError(`WakaTime ${response.status}: ${path}`);
    }
    if (!response.ok) {
      throw new Error(`WakaTime ${response.status}: ${path}`);
    }
    return (await response.json()) as T;
  }
}

/** One day of the summaries answer as the rows to save; seconds are rounded to whole ones. */
export function parseSummary(raw: RawSummary): WakatimeSummaryDay {
  return {
    day: raw.range.date,
    totalSeconds: Math.round(raw.grand_total.total_seconds),
    breakdown: BREAKDOWN_FIELDS.flatMap(([field, kind]) =>
      ((raw[field] as RawItem[] | undefined) ?? [])
        .map((item) => ({ kind, name: item.name, seconds: Math.round(item.total_seconds) }))
        // Heartbeats shorter than a second round to nothing.
        .filter((item) => item.name && item.seconds > 0),
    ),
  };
}

// --- Raw WakaTime API responses (only the fields we use) ---

interface RawItem {
  name: string;
  total_seconds: number;
}

export interface RawSummary {
  range: { date: string };
  grand_total: { total_seconds: number };
  projects?: RawItem[];
  languages?: RawItem[];
  editors?: RawItem[];
  operating_systems?: RawItem[];
  categories?: RawItem[];
  machines?: RawItem[];
}

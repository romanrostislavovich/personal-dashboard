/**
 * Crisis lines for the help button (Psychology → Help, the gentle day): numbers a person can call
 * when it is too hard, by country. Every country names where its numbers were checked and when:
 * a number that stops working is worse than none, so check them again now and then (and before
 * adding a country, from an official source). For any other country: Find A Helpline.
 */

export interface CrisisLine {
  /** As the service calls itself. */
  name: string;
  /** As it is dialled: `800 70 2222`. */
  phone: string;
  /** `true` — day and night. */
  allDay: boolean;
  /** Its own page: a chat, other ways to reach it. */
  url?: string;
}

export interface CrisisCountry {
  /** ISO 3166-1 alpha-2: `PL`. */
  code: string;
  /** For immediate danger. */
  emergency: string;
  lines: CrisisLine[];
  /** Where the numbers were checked. */
  sources: string[];
}

/** When the numbers below were last checked. */
export const CRISIS_LINES_CHECKED_ON = '2026-10-24';

/** Every country's lines, by the help organisations' own directory. */
export const FIND_A_HELPLINE = 'https://findahelpline.com';

export const CRISIS_LINES: CrisisCountry[] = [
  {
    code: 'PL',
    emergency: '112',
    lines: [
      {
        name: 'Centrum Wsparcia dla Osób Dorosłych w Kryzysie Psychicznym',
        phone: '800 70 2222',
        allDay: true,
        url: 'https://centrumwsparcia.pl',
      },
      {
        name: 'Telefon zaufania dla dorosłych w kryzysie emocjonalnym',
        phone: '116 123',
        // Older sources say 14:00–22:00; the newer ones, day and night.
        allDay: false,
        url: 'https://116sos.pl',
      },
    ],
    sources: [
      'https://pacjent.gov.pl',
      'https://findahelpline.com/countries/pl',
    ],
  },
  {
    code: 'UA',
    emergency: '112',
    lines: [
      {
        name: 'Lifeline Ukraine',
        phone: '7333',
        allDay: true,
        url: 'https://lifelineukraine.com',
      },
    ],
    sources: ['https://www.kmu.gov.ua'],
  },
  {
    code: 'DE',
    emergency: '112',
    lines: [
      {
        name: 'TelefonSeelsorge',
        phone: '0800 111 0 111',
        allDay: true,
        url: 'https://www.telefonseelsorge.de',
      },
    ],
    sources: ['https://www.telefonseelsorge.de'],
  },
  {
    code: 'GB',
    emergency: '999',
    lines: [
      {
        name: 'Samaritans',
        phone: '116 123',
        allDay: true,
        url: 'https://www.samaritans.org',
      },
    ],
    sources: ['https://www.samaritans.org'],
  },
  {
    code: 'US',
    emergency: '911',
    lines: [
      {
        name: '988 Suicide & Crisis Lifeline',
        phone: '988',
        allDay: true,
        url: 'https://988lifeline.org',
      },
    ],
    sources: ['https://988lifeline.org'],
  },
];

/** The time zones of the countries above: the user's own country comes first. */
const ZONES: Record<string, string> = {
  'Europe/Warsaw': 'PL',
  'Europe/Kyiv': 'UA',
  'Europe/Kiev': 'UA',
  'Europe/Berlin': 'DE',
  'Europe/London': 'GB',
  'America/New_York': 'US',
  'America/Chicago': 'US',
  'America/Denver': 'US',
  'America/Phoenix': 'US',
  'America/Los_Angeles': 'US',
  'America/Anchorage': 'US',
  'Pacific/Honolulu': 'US',
};

/** The country of a time zone, among those with lines here; `null` — none of them. */
export function crisisCountryOf(
  timeZone: string | null | undefined,
): string | null {
  return timeZone ? (ZONES[timeZone] ?? null) : null;
}

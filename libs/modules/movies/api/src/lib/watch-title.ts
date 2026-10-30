import {WatchHints} from '@pd/contracts';

/** What a page's hints say is playing. */
export interface WatchTitle {
  /** `video` — a site of videos (YouTube): never looked up as a film. */
  kind: 'video' | 'title';
  name: string;
  year: number | null;
  season: number | null;
  episode: number | null;
}

/** Sites whose videos are videos, not films or shows. */
const VIDEO_SITES = [
  'youtube.com',
  'youtu.be',
  'twitch.tv',
  'rutube.ru',
  'vkvideo.ru',
  'dzen.ru',
  'tiktok.com',
  'vimeo.com',
];

/**
 * The site's own name after the title: "Film — Kinogo", "Video - YouTube". (No `\b` near Cyrillic
 * in these patterns: JavaScript counts only Latin letters as word characters.)
 */
const SEPARATOR = /\s+[|—–-]\s+|\s*[|]\s*/;

/** Where a pirate site's advertising starts: "… смотреть онлайн бесплатно в HD". */
const TAIL = [
  /\s*(?:фильм|сериал|мультфильм|аниме)?\s*смотреть(?!\p{L}).*$/iu,
  /\s*(?:watch|stream)\b.*\bonline\b.*$/i,
  /\s*онлайн\s+бесплатно.*$/i,
  /\s*в\s+хорошем\s+качестве.*$/i,
  /\s*(?:full\s*hd|hd\s*\d{3,4}p?|\d{3,4}p|hdrip|webrip|bdrip)\b.*$/i,
  /\s*на\s+русском.*$/i,
];

/** "Фильм Дюна" → "Дюна". */
const HEAD =
  /^(?:фильм|сериал|мультфильм|мультсериал|аниме|movie|tv series|series)\s+/i;

const EPISODE: {pattern: RegExp; season: number | null; episode: number}[] = [
  // S1:E3, s01e03, S1 E3
  {pattern: /\bs(\d{1,2})\s*[:.]?\s*e(\d{1,3})\b/i, season: 1, episode: 2},
  // 2 сезон 5 серия, 2 сезон, 5 серия
  {
    pattern:
      /(\d{1,2})\s*-?\s*(?:й\s*)?сезон[\s,.:]*(\d{1,3})\s*-?\s*(?:я\s*)?серия/i,
    season: 1,
    episode: 2,
  },
  // Сезон 2 Серия 5, Сезон 2, эпизод 5, Сезон 2: Эп. 5
  {
    pattern: /сезон\s*(\d{1,2})[\s,.:]*(?:серия|эпизод|эп\.?)\s*(\d{1,3})/i,
    season: 1,
    episode: 2,
  },
  // Season 2 Episode 5
  {
    pattern: /season\s*(\d{1,2})[\s,.:]*(?:episode|ep\.?)\s*(\d{1,3})/i,
    season: 1,
    episode: 2,
  },
  // 5 серия (season unknown)
  {pattern: /(\d{1,3})\s*-?\s*(?:я\s*)?серия/i, season: null, episode: 1},
  {pattern: /серия\s*(\d{1,3})/i, season: null, episode: 1},
  {pattern: /episode\s*(\d{1,3})/i, season: null, episode: 1},
];

const YEAR =
  /\(\s*((?:19|20)\d{2})(?:\s*[-–]\s*(?:(?:19|20)\d{2})?)?\s*\)|\b((?:19|20)\d{2})\s*$/;

export function isVideoSite(site: string): boolean {
  return VIDEO_SITES.some(
    video => site === video || site.endsWith(`.${video}`),
  );
}

/**
 * The title of what plays, read from the page: the player's own title first (it is exact), then
 * the page's `og:title`, its heading and its `<title>` — each without the site's name and the
 * advertising around it. Season and episode come from any of them; `null` — nothing to read.
 */
export function watchTitle(site: string, hints: WatchHints): WatchTitle | null {
  const all = [
    hints.playerTitle,
    hints.playerSubtitle,
    hints.ogTitle,
    hints.heading,
    hints.pageTitle,
  ]
    .filter((text): text is string => !!text?.trim())
    .join('\n');
  if (isVideoSite(site)) {
    const name = cleanVideo(
      hints.playerTitle ?? hints.ogTitle ?? hints.pageTitle ?? '',
    );
    return name
      ? {kind: 'video', name, year: null, season: null, episode: null}
      : null;
  }
  const {season, episode} = episodeOf(all);
  for (const raw of [
    hints.playerTitle,
    hints.ogTitle,
    hints.heading,
    hints.pageTitle,
  ]) {
    const found = cleanTitle(raw ?? '', site);
    if (found.name) {
      return {
        kind: 'title',
        name: found.name,
        year: found.year ?? yearOf(all),
        season,
        episode,
      };
    }
  }
  return null;
}

function episodeOf(text: string): {
  season: number | null;
  episode: number | null;
} {
  for (const {pattern, season, episode} of EPISODE) {
    const match = text.match(pattern);
    if (match) {
      return {
        season: season === null ? null : Number(match[season]),
        episode: Number(match[episode]),
      };
    }
  }
  return {season: null, episode: null};
}

function yearOf(text: string): number | null {
  const match = text.match(/\(\s*((?:19|20)\d{2})/);
  return match ? Number(match[1]) : null;
}

/** One hint without the site's name, the advertising, the episode and the year. */
export function cleanTitle(
  raw: string,
  site: string,
): {name: string; year: number | null} {
  const siteName = site.split('.')[0].toLowerCase();
  let text =
    raw
      .replace(/\s+/g, ' ')
      .trim()
      .split(SEPARATOR)
      .map(part => part.trim())
      .find(
        part => part && part.toLowerCase().replace(/\s/g, '') !== siteName,
      ) ?? '';
  for (const tail of TAIL) {
    text = text.replace(tail, '');
  }
  for (const {pattern} of EPISODE) {
    text = text.replace(pattern, ' ');
  }
  text = text.replace(
    /(?:сезон|season)\s*\d{1,2}(?!\d)|(?<!\d)\d{1,2}\s*-?\s*(?:й\s*)?сезон/giu,
    ' ',
  );
  let year: number | null = null;
  const match = text.match(YEAR);
  if (match) {
    year = Number(match[1] ?? match[2]);
    text = text.replace(match[0], ' ');
  }
  text = text
    .replace(HEAD, '')
    .replace(/[«»"]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/^[\s,.:;!/\\-]+|[\s,.:;/\\-]+$/g, '')
    .trim();
  // "Netflix", "Kinogo" alone are not a title.
  if (!text || text.toLowerCase() === siteName || text.length < 2) {
    return {name: '', year};
  }
  return {name: text.slice(0, 200), year};
}

function cleanVideo(raw: string): string {
  return raw
    .replace(/^\(\d+\)\s*/, '') // "(3) Video - YouTube": unread notifications
    .replace(/\s+-\s+YouTube$/i, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200);
}

/** A title as it is compared: lower case, letters and digits only, ё as е. */
export function matchKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

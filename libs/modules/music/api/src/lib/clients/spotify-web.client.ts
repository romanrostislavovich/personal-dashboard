import { fetchWithTimeout } from '@pd/api-core';

/*
 * A song's page on Spotify without Spotify's API (the server has no Spotify app keys): the
 * pages `open.spotify.com/track/…` a web search finds for "artist title", each checked through
 * Spotify's public oEmbed, which tells a page's title. Only a page whose title is the song's is
 * taken; nothing matching (or the search not answering) — no link, and the caller keeps the
 * link to Spotify's search.
 */

const SEARCH = 'https://html.duckduckgo.com/html/';
const OEMBED = 'https://open.spotify.com/oembed';
/** Pages checked at most: the right one is among the first. */
const CANDIDATES = 3;
const HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36',
  'Accept-Language': 'en',
};

export async function findOnSpotifyWeb(
  track: string,
  artist: string | null,
): Promise<string | null> {
  const query = `site:open.spotify.com/track ${[artist, track].filter(Boolean).join(' ')}`;
  const response = await fetchWithTimeout(`${SEARCH}?q=${encodeURIComponent(query)}`, {
    headers: HEADERS,
  });
  if (response.status !== 200) {
    // 202 — the search asks to slow down: no link this time.
    return null;
  }
  for (const id of trackIds(await response.text()).slice(0, CANDIDATES)) {
    const url = `https://open.spotify.com/track/${id}`;
    const title = await titleOf(url).catch(() => null);
    if (title && sameSong(title, track)) {
      return url;
    }
  }
  return null;
}

/** The ids of the Spotify songs a page of results links to, in their order. */
export function trackIds(page: string): string[] {
  const found = page.matchAll(/open\.spotify\.com(?:%2F|\/)track(?:%2F|\/)([A-Za-z0-9]{22})/g);
  return [...new Set([...found].map((match) => match[1]))];
}

/**
 * Whether a title on Spotify is the song: the same words, one inside the other — "Get Lucky"
 * and "Get Lucky (feat. Pharrell Williams)" are; "Get Lucky" and "Lose Yourself" are not.
 */
export function sameSong(title: string, track: string): boolean {
  const words = (text: string) =>
    text
      .toLocaleLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
      .trim();
  const a = words(title);
  const b = words(track);
  return Boolean(a && b) && (a.includes(b) || b.includes(a));
}

async function titleOf(url: string): Promise<string | null> {
  const response = await fetchWithTimeout(`${OEMBED}?url=${encodeURIComponent(url)}`, {
    headers: HEADERS,
  });
  if (!response.ok) {
    return null;
  }
  return ((await response.json()) as { title?: string }).title ?? null;
}

import { fetchWithTimeout } from '@pd/api-core';

/**
 * The search of YouTube Music, as its own site asks it (there is no public API): the first
 * song found for "artist title". Unofficial, so it may stop answering one day — then the
 * caller falls back to a link to the search.
 */
const SEARCH = 'https://music.youtube.com/youtubei/v1/search?prettyPrint=false';
/** The "Songs" filter of the search, as the site sends it. */
const SONGS_ONLY = 'EgWKAQIIAWoKEAkQBRAKEAMQBA%3D%3D';
const CLIENT = { clientName: 'WEB_REMIX', clientVersion: '1.20250101.01.00', hl: 'en' };

/** The link of the song on YouTube Music; `null` — none found. */
export async function findOnYoutubeMusic(query: string): Promise<string | null> {
  const response = await fetchWithTimeout(SEARCH, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: 'https://music.youtube.com',
      'User-Agent': 'Mozilla/5.0',
    },
    body: JSON.stringify({ context: { client: CLIENT }, query, params: SONGS_ONLY }),
  });
  if (!response.ok) {
    throw new Error(`YouTube Music ${response.status}`);
  }
  const id = firstSong(await response.text());
  return id ? `https://music.youtube.com/watch?v=${id}` : null;
}

/** The first song of an answer (the "Songs" filter leaves only songs in it). */
export function firstSong(answer: string): string | null {
  return /"videoId":"([\w-]{11})"/.exec(answer)?.[1] ?? null;
}

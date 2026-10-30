import {LastfmTag} from './clients/lastfm.client';

/** At most this many genres an artist gets. */
const MAX_GENRES = 3;
/** A tag given less often than this (the top one is 100) is one listener's opinion. */
const MIN_WEIGHT = 10;

/**
 * Tags that say nothing about the music: how a listener feels about it, where they heard it.
 * Countries and decades stay out too — "russian", "80s" are not genres.
 */
const NOT_GENRES = [
  /^seen live$/,
  /favou?rite/,
  /^(my |all time )?favou?rites?$/,
  /^love(d)?$/,
  /^awesome$/,
  /^beautiful$/,
  /^good$/,
  /^cool$/,
  /^under \d+/,
  /^\d{2,4}s?$/,
  /^(male|female) vocalists?$/,
  /^(russian|russia|polish|ukrainian|american|british|german|french|swedish|japanese|korean|usa|uk)$/,
  /^spotify$/,
];

/** The genres of an artist from its Last.fm tags: lower case, the most given first. */
export function genresFromTags(tags: LastfmTag[]): string[] {
  const genres: string[] = [];
  for (const tag of [...tags].sort((a, b) => b.count - a.count)) {
    const name = tag.name.trim().toLowerCase().replace(/\s+/g, ' ');
    if (
      tag.count < MIN_WEIGHT ||
      !name ||
      name.length > 30 ||
      NOT_GENRES.some(pattern => pattern.test(name)) ||
      genres.includes(name)
    ) {
      continue;
    }
    genres.push(name);
    if (genres.length === MAX_GENRES) {
      break;
    }
  }
  return genres;
}

/** A Links key for a genre: `music.genre.hip-hop`. */
export function genreKey(genre: string): string {
  return `music.genre.${genre.replace(/[^a-z0-9а-яё]+/gi, '-')}`;
}

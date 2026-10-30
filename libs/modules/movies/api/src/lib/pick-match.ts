import {MovieSearchResult} from '@pd/contracts';
import {matchKey, WatchTitle} from './watch-title';

/**
 * The film or show of TMDB's results that is the one the page named — or none: a wrong title is
 * worse than "not found" (the user finds it by hand then). The name has to be the same (in the
 * user's language or the original one), or begin the same with the year agreeing; an episode
 * means a show. Among equals TMDB's own order (relevance) decides.
 */
export function pickMatch(
  results: MovieSearchResult[],
  watched: Pick<WatchTitle, 'name' | 'year' | 'episode'>,
): MovieSearchResult | null {
  const key = matchKey(watched.name);
  if (!key) {
    return null;
  }
  let best: {result: MovieSearchResult; score: number} | null = null;
  for (const result of results) {
    const score = scoreOf(result, key, watched);
    if (score !== null && score > 0 && (!best || score > best.score)) {
      best = {result, score};
    }
  }
  return best?.result ?? null;
}

/** How well one of TMDB's results fits the page's title; `null` — it is not the one. */
function scoreOf(
  result: MovieSearchResult,
  key: string,
  watched: Pick<WatchTitle, 'year' | 'episode'>,
): number | null {
  if (watched.episode !== null && result.kind !== 'tv') {
    return null;
  }
  const keys = [result.title, result.originalTitle]
    .filter((name): name is string => !!name)
    .map(matchKey);
  const same = keys.includes(key);
  const begins = keys.some(
    other =>
      Math.min(other.length, key.length) >= 4 &&
      (other.startsWith(key) || key.startsWith(other)),
  );
  if (!same && !begins) {
    return null;
  }
  const yearGap =
    watched.year && result.year ? Math.abs(watched.year - result.year) : null;
  // A show's year on a site may be any of its seasons; a film's is its own.
  const yearAgrees = yearGap !== null && (yearGap <= 1 || result.kind === 'tv');
  const yearDisagrees = yearGap !== null && !yearAgrees;
  if (!same && !yearAgrees) {
    return null;
  }
  return (same ? 3 : 1) + (yearAgrees ? 2 : 0) - (yearDisagrees ? 3 : 0);
}

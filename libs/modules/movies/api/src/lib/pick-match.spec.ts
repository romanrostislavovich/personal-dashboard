import { MovieSearchResult } from '@pd/contracts';
import { pickMatch } from './pick-match';

const found = (
  tmdbId: number,
  kind: 'movie' | 'tv',
  title: string,
  year: number | null,
  originalTitle: string | null = null,
): MovieSearchResult => ({
  tmdbId,
  kind,
  title,
  originalTitle,
  year,
  posterUrl: null,
  overview: null,
});

describe('pickMatch', () => {
  it('takes the same name of the right year, not the first result', () => {
    const results = [found(1, 'movie', 'Дюна', 1984), found(2, 'movie', 'Дюна', 2021)];
    expect(pickMatch(results, { name: 'Дюна', year: 2021, episode: null })?.tmdbId).toBe(2);
    // No year: TMDB's order.
    expect(pickMatch(results, { name: 'Дюна', year: null, episode: null })?.tmdbId).toBe(1);
  });

  it('knows a title by its original name too', () => {
    const results = [found(7, 'tv', 'Очень странные дела', 2016, 'Stranger Things')];
    expect(pickMatch(results, { name: 'Stranger Things', year: null, episode: 7 })?.tmdbId).toBe(7);
  });

  it('wants a show for an episode', () => {
    const results = [found(1, 'movie', 'Ведьмак', 2001), found(2, 'tv', 'Ведьмак', 2019)];
    expect(pickMatch(results, { name: 'Ведьмак', year: null, episode: 3 })?.tmdbId).toBe(2);
  });

  it('takes a longer name only when the year agrees', () => {
    const results = [found(3, 'movie', 'Дюна: Часть вторая', 2024)];
    expect(
      pickMatch(results, { name: 'Дюна часть вторая', year: null, episode: null })?.tmdbId,
    ).toBe(3);
    expect(pickMatch(results, { name: 'Дюна часть', year: 2024, episode: null })?.tmdbId).toBe(3);
    expect(pickMatch(results, { name: 'Дюна часть', year: null, episode: null })).toBeNull();
  });

  it('finds nothing rather than something else', () => {
    const results = [found(4, 'movie', 'Интерстеллар', 2014)];
    expect(pickMatch(results, { name: 'Начало', year: 2010, episode: null })).toBeNull();
    expect(pickMatch(results, { name: 'Интерстеллар', year: 1999, episode: null })).toBeNull();
  });
});

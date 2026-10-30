import {genreKey, genresFromTags} from './music-genres';

describe('genresFromTags', () => {
  it('keeps up to three genres, the most given first, without opinions and places', () => {
    expect(
      genresFromTags([
        {name: 'seen live', count: 100},
        {name: 'Hip-Hop', count: 90},
        {name: 'russian', count: 80},
        {name: 'rap', count: 70},
        {name: 'favorites', count: 60},
        {name: '90s', count: 50},
        {name: 'Hip-Hop', count: 40},
        {name: 'trap', count: 30},
        {name: 'electronic', count: 20},
      ]),
    ).toEqual(['hip-hop', 'rap', 'trap']);
  });

  it('drops the tags only a few listeners gave', () => {
    expect(
      genresFromTags([
        {name: 'indie', count: 100},
        {name: 'shoegaze', count: 5},
      ]),
    ).toEqual(['indie']);
  });

  it('makes a key for Links of any genre', () => {
    expect(genreKey('drum and bass')).toBe('music.genre.drum-and-bass');
    expect(genreKey('русский рок')).toBe('music.genre.русский-рок');
  });
});

import { MusicTopItem } from '@pd/contracts';
import { ARTIST_OF_THE_WEEK_MIN_PLAYS, artistOfTheWeek } from './music.digest';

const artist = (name: string, playcount: number): MusicTopItem => ({
  name,
  artist: null,
  playcount,
  url: '',
  imageUrl: null,
});

describe('artistOfTheWeek', () => {
  it('is the most played artist of the week', () => {
    expect(artistOfTheWeek([artist('Muse', 42), artist('Evanescence', 3)])).toBe('Muse');
  });

  it('is nobody when the top was played only a few times (an autoplay, a guest)', () => {
    expect(artistOfTheWeek([artist('Evanescence', ARTIST_OF_THE_WEEK_MIN_PLAYS - 1)])).toBeNull();
    expect(artistOfTheWeek([])).toBeNull();
    expect(artistOfTheWeek(undefined)).toBeNull();
  });
});

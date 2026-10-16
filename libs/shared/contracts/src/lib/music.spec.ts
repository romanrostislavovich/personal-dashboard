import { songLinks } from './music';

describe('songLinks', () => {
  it('finds a song by its artist and title on both services', () => {
    expect(songLinks({ track: 'Кино & Co', artist: 'Виктор Цой' })).toEqual({
      youtubeMusic:
        'https://music.youtube.com/search?q=%D0%92%D0%B8%D0%BA%D1%82%D0%BE%D1%80%20%D0%A6%D0%BE%D0%B9%20%D0%9A%D0%B8%D0%BD%D0%BE%20%26%20Co',
      spotify:
        'https://open.spotify.com/search/%D0%92%D0%B8%D0%BA%D1%82%D0%BE%D1%80%20%D0%A6%D0%BE%D0%B9%20%D0%9A%D0%B8%D0%BD%D0%BE%20%26%20Co',
    });
  });

  it('keeps a Spotify link it knows, and not a Last.fm one', () => {
    const spotify = 'https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC';
    expect(songLinks({ track: 'Song', artist: 'A', url: spotify }).spotify).toBe(spotify);
    expect(
      songLinks({ track: 'Song', artist: 'A', url: 'https://www.last.fm/music/A/_/Song' }).spotify,
    ).toBe('https://open.spotify.com/search/A%20Song');
  });
});

import { growth, trackNews } from './soundcloud-news';
import { findClientId, toTrack } from './soundcloud.client';

const track = { title: 'Mix', permalinkUrl: 'https://soundcloud.com/me/mix' };

describe('trackNews', () => {
  it('tells the highest play milestone crossed', () => {
    expect(trackNews(track, { plays: 480, comments: 2 }, { plays: 1030, comments: 2 })).toEqual({
      ...track,
      playsMilestone: 1000,
      newComments: 0,
    });
  });

  it('counts new comments', () => {
    expect(
      trackNews(track, { plays: 120, comments: 1 }, { plays: 130, comments: 4 }),
    ).toMatchObject({ playsMilestone: null, newComments: 3 });
  });

  it('says nothing about ordinary growth or a removed comment', () => {
    expect(trackNews(track, { plays: 120, comments: 3 }, { plays: 180, comments: 2 })).toBeNull();
  });
});

describe('growth', () => {
  const today = { year: 2026, month: 10, day: 10 };
  const history = [
    { day: '2026-10-01', value: 100 },
    { day: '2026-10-03', value: 140 },
    { day: '2026-10-09', value: 190 },
  ];

  it('counts from the last point that is old enough', () => {
    expect(growth(history, 200, today, 7)).toBe(60);
  });

  it('counts from the earliest point when the history is shorter', () => {
    expect(growth(history, 200, today, 30)).toBe(100);
    expect(growth([], 200, today, 7)).toBe(0);
  });
});

describe('SoundCloud answers', () => {
  it('finds the client id in a script of the site', () => {
    expect(findClientId('a={client_id:"AbCdEfGhIjKlMnOpQrStUvWx0123",env:"p"}')).toBe(
      'AbCdEfGhIjKlMnOpQrStUvWx0123',
    );
    expect(findClientId('nothing here')).toBeNull();
  });

  it('reads a track whose counters are hidden as zeros', () => {
    expect(
      toTrack({
        id: 7,
        title: 'Mix',
        permalink_url: 'https://soundcloud.com/me/mix',
        sharing: 'private',
        created_at: '2026-01-02T03:04:05Z',
        playback_count: 12,
        comment_count: null,
      }),
    ).toMatchObject({ id: '7', isPrivate: true, plays: 12, comments: 0, likes: 0, genre: null });
  });
});

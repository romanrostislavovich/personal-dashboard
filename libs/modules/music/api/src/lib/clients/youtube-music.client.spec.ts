import {findOnYoutubeMusic, firstSong} from './youtube-music.client';

/** Asks the real YouTube Music when set: `TEST_YOUTUBE_MUSIC=1`. */
const LIVE = process.env['TEST_YOUTUBE_MUSIC'] === '1';

describe('YouTube Music', () => {
  it('takes the first song of an answer', () => {
    const answer =
      '{"contents":[{"videoId":"xtxjm7ciwmc","title":"a"},{"videoId":"EByofhvVRco"}]}';
    expect(firstSong(answer)).toBe('xtxjm7ciwmc');
    expect(firstSong('{"contents":[]}')).toBeNull();
  });

  it.skipIf(!LIVE)(
    'finds a song straight away',
    async () => {
      const link = await findOnYoutubeMusic('Кино Группа крови');
      expect(link).toMatch(
        /^https:\/\/music\.youtube\.com\/watch\?v=[\w-]{11}$/,
      );
    },
    30_000,
  );
});

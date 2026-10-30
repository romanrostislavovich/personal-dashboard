import {findOnSpotifyWeb, sameSong, trackIds} from './spotify-web.client';

/** Asks the real web search and Spotify when set: `TEST_SPOTIFY_WEB=1`. */
const LIVE = process.env['TEST_SPOTIFY_WEB'] === '1';

describe('Spotify without its API', () => {
  it('reads the songs a page of results links to, in order, once each', () => {
    const page =
      'href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fopen.spotify.com%2Ftrack%2F4pRAG3h4ZTfyEhRMytddzd&x"' +
      ' https://open.spotify.com/track/66xHyI6ITToQPm7PdOzIyn https://open.spotify.com/track/4pRAG3h4ZTfyEhRMytddzd';
    expect(trackIds(page)).toEqual([
      '4pRAG3h4ZTfyEhRMytddzd',
      '66xHyI6ITToQPm7PdOzIyn',
    ]);
  });

  it('takes a title for the song only when the words are the same', () => {
    expect(
      sameSong(
        'Get Lucky (feat. Pharrell Williams and Nile Rodgers)',
        'Get Lucky',
      ),
    ).toBe(true);
    expect(
      sameSong(
        'Vielleicht Vielleicht - Holy Priest & elMefti Remix',
        'Vielleicht Vielleicht (Holy Priest & elMefti Remix)',
      ),
    ).toBe(true);
    expect(sameSong('Lose Yourself', 'Get Lucky')).toBe(false);
  });

  it.skipIf(!LIVE)(
    'finds a remix straight away',
    async () => {
      expect(
        await findOnSpotifyWeb(
          'Vielleicht Vielleicht - Holy Priest & elMefti Remix',
          'MilleniumKid',
        ),
      ).toBe('https://open.spotify.com/track/4pRAG3h4ZTfyEhRMytddzd');
    },
    30_000,
  );
});

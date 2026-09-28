import { LastfmRecentPage, LastfmTrack } from './clients/lastfm.client';
import { nextCursor } from './lastfm-history.import';

/** A page of `count` plays, one per second, the oldest at `oldestSec`. */
function page(count: number, oldestSec: number, totalPages = 5): LastfmRecentPage {
  const tracks: LastfmTrack[] = Array.from({ length: count }, (_, i) => ({
    track: `t${i}`,
    artist: 'a',
    album: null,
    imageUrl: null,
    url: '',
    playedAt: new Date((oldestSec + count - 1 - i) * 1000),
  }));
  return { tracks, totalPages };
}

describe('nextCursor', () => {
  it('continues from the oldest play of the page, including its second', () => {
    expect(nextCursor(page(200, 1_000), 5_000)).toBe(1_001);
  });

  it('steps past the second when the cursor would not move', () => {
    // 200 plays in the same second as the cursor: including it again would repeat the page.
    const sameSecond = page(200, 1_000);
    sameSecond.tracks.forEach((t) => (t.playedAt = new Date(1_000_000)));
    expect(nextCursor(sameSecond, 1_001)).toBe(1_000);
  });

  it('stops on the last page', () => {
    expect(nextCursor(page(37, 1_000, 1), 5_000)).toBeNull();
    expect(nextCursor(page(0, 1_000, 1), 5_000)).toBeNull();
  });

  it('ignores the track that is playing now', () => {
    const withNowPlaying = page(200, 1_000);
    withNowPlaying.tracks.unshift({ ...withNowPlaying.tracks[0], playedAt: null });
    expect(nextCursor(withNowPlaying, undefined)).toBe(1_001);
  });
});

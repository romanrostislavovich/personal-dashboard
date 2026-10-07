import { LocalDate } from '@pd/contracts';

/** On the diary's scale of 1–5: a good day and a bad one (as the core compares them). */
const GOOD_FROM = 4;
const BAD_UP_TO = 2;
/** An artist heard on fewer days than this says nothing about a mood. */
const MIN_DAYS = 3;
const TOP = 10;

export interface MoodArtist {
  artist: string;
  /** Days of the kind the artist was played on, and the plays on them. */
  days: number;
  plays: number;
  /** How much of the days of the kind that is, percent. */
  share: number;
}

export interface MoodArtists {
  goodDays: number;
  badDays: number;
  /** The artists that go with the days of a good mood rather than a bad one, and the reverse. */
  onGoodDays: MoodArtist[];
  onBadDays: MoodArtist[];
}

/**
 * Who plays on the days of a good mood and who on the bad ones: an artist goes with a kind of
 * day when the share of such days they were played on is higher than of the other kind. It
 * shows what goes together, not what lifts a mood.
 */
export function moodArtists(
  mood: { day: LocalDate; value: number }[],
  plays: { day: LocalDate; artist: string; plays: number }[],
): MoodArtists {
  const good = new Set(mood.filter((day) => day.value >= GOOD_FROM).map((day) => day.day));
  const bad = new Set(mood.filter((day) => day.value <= BAD_UP_TO).map((day) => day.day));
  const artists = new Map<
    string,
    { good: number; bad: number; goodPlays: number; badPlays: number }
  >();
  for (const play of plays) {
    const kind = good.has(play.day) ? 'good' : bad.has(play.day) ? 'bad' : null;
    if (!kind) {
      continue;
    }
    const known = artists.get(play.artist) ?? { good: 0, bad: 0, goodPlays: 0, badPlays: 0 };
    known[kind] += 1;
    known[`${kind}Plays`] += play.plays;
    artists.set(play.artist, known);
  }
  const share = (days: number, of: number) => (of ? days / of : 0);
  const side = (kind: 'good' | 'bad'): MoodArtist[] => {
    const [own, other] = kind === 'good' ? [good, bad] : [bad, good];
    const otherKind = kind === 'good' ? 'bad' : 'good';
    return [...artists]
      .filter(
        ([, counts]) =>
          counts[kind] >= MIN_DAYS &&
          share(counts[kind], own.size) > share(counts[otherKind], other.size),
      )
      .sort(
        ([, a], [, b]) =>
          share(b[kind], own.size) -
          share(b[otherKind], other.size) -
          (share(a[kind], own.size) - share(a[otherKind], other.size)),
      )
      .slice(0, TOP)
      .map(([artist, counts]) => ({
        artist,
        days: counts[kind],
        plays: counts[`${kind}Plays`],
        share: Math.round(share(counts[kind], own.size) * 100),
      }));
  };
  return {
    goodDays: good.size,
    badDays: bad.size,
    onGoodDays: side('good'),
    onBadDays: side('bad'),
  };
}

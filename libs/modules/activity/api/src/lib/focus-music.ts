import { ActivityFocusMusic, ActivityFocusMusicGroup } from '@pd/contracts';

/** A focus session with the music that played during it. */
export interface FocusWithPlays {
  completed: boolean;
  focusSeconds: number;
  distractedSeconds: number;
  /** The artist of every play during the session. */
  artists: string[];
}

const TOP_ARTISTS = 10;

function group(sessions: FocusWithPlays[]): ActivityFocusMusicGroup {
  const focusSeconds = sessions.reduce((sum, session) => sum + session.focusSeconds, 0);
  const distracted = sessions.reduce((sum, session) => sum + session.distractedSeconds, 0);
  const percent = (part: number, whole: number) => (whole ? Math.round((part / whole) * 100) : 0);
  return {
    sessions: sessions.length,
    focusSeconds,
    completedPercent: percent(
      sessions.filter((session) => session.completed).length,
      sessions.length,
    ),
    distractedPercent: percent(distracted, focusSeconds),
  };
}

/**
 * Focus with music against focus in silence: how many sessions were finished and how much of
 * their time went to distractions, and the artists that played in the most sessions.
 */
export function focusMusic(sessions: FocusWithPlays[]): ActivityFocusMusic {
  const artists = new Map<string, { artist: string; sessions: number; plays: number }>();
  for (const session of sessions) {
    for (const artist of new Set(session.artists)) {
      const known = artists.get(artist) ?? { artist, sessions: 0, plays: 0 };
      known.sessions += 1;
      known.plays += session.artists.filter((name) => name === artist).length;
      artists.set(artist, known);
    }
  }
  return {
    withMusic: group(sessions.filter((session) => session.artists.length > 0)),
    withoutMusic: group(sessions.filter((session) => session.artists.length === 0)),
    artists: [...artists.values()]
      .sort((a, b) => b.sessions - a.sessions || b.plays - a.plays)
      .slice(0, TOP_ARTISTS),
  };
}

/**
 * The seconds worked on each of the names: a focus session counts for a name when its note is
 * the name or contains it ("Fix login" for the task "fix login"). A short name is only matched
 * whole — "ui" is inside too many words.
 */
export function timeByName(
  sessions: { note: string | null; focusSeconds: number }[],
  names: string[],
): Map<string, number> {
  const spent = new Map<string, number>();
  for (const session of sessions) {
    const note = session.note?.trim().toLowerCase();
    if (!note) {
      continue;
    }
    for (const name of names) {
      if (note === name || (name.length >= MIN_PART && note.includes(name))) {
        spent.set(name, (spent.get(name) ?? 0) + session.focusSeconds);
      }
    }
  }
  return spent;
}

const MIN_PART = 5;

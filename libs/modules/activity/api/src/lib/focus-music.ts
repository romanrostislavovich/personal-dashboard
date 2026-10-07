import { ActivityFocusMusic, ActivityFocusMusicGroup } from '@pd/contracts';

/** A focus session with the music that played during it. */
export interface FocusWithPlays {
  completed: boolean;
  focusSeconds: number;
  distractedSeconds: number;
  /** The artist of every play during the session. */
  artists: string[];
  /** The project the session was for; `null` — none. */
  project?: string | null;
}

const TOP_ARTISTS = 10;
/** Artists named for a project. */
const PROJECT_ARTISTS = 3;

/** The artists of some sessions, the one heard in the most of them first. */
function topArtists(sessions: FocusWithPlays[]) {
  const artists = new Map<string, { artist: string; sessions: number; plays: number }>();
  for (const session of sessions) {
    for (const artist of new Set(session.artists)) {
      const known = artists.get(artist) ?? { artist, sessions: 0, plays: 0 };
      known.sessions += 1;
      known.plays += session.artists.filter((name) => name === artist).length;
      artists.set(artist, known);
    }
  }
  return [...artists.values()].sort((a, b) => b.sessions - a.sessions || b.plays - a.plays);
}

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
  const withMusic = sessions.filter((session) => session.artists.length > 0);
  const projects = [...new Set(withMusic.map((session) => session.project ?? null))];
  return {
    withMusic: group(withMusic),
    withoutMusic: group(sessions.filter((session) => session.artists.length === 0)),
    artists: topArtists(withMusic).slice(0, TOP_ARTISTS),
    byProject: projects
      .map((project) => {
        const ofProject = withMusic.filter((session) => (session.project ?? null) === project);
        return {
          project,
          sessions: ofProject.length,
          artists: topArtists(ofProject)
            .slice(0, PROJECT_ARTISTS)
            .map((item) => item.artist),
        };
      })
      .sort((a, b) => b.sessions - a.sessions),
  };
}

/**
 * The seconds windows named after each of the names were in front: a window counts when its
 * title contains the name ("fix-login — main.ts" for the task "fix-login"). Only a name long
 * enough to be told from an ordinary word is looked for.
 */
export function timeByTitle(
  titles: { title: string; seconds: number }[],
  names: string[],
): Map<string, number> {
  const spent = new Map<string, number>();
  const wanted = names.filter((name) => name.length >= MIN_TITLE_PART);
  for (const { title, seconds } of titles) {
    for (const name of wanted) {
      if (title.includes(name)) {
        spent.set(name, (spent.get(name) ?? 0) + seconds);
      }
    }
  }
  return spent;
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
const MIN_TITLE_PART = 6;

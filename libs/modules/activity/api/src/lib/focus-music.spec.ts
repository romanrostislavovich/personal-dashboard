import { focusMusic, timeByName, timeByTitle } from './focus-music';

const session = (artists: string[], completed: boolean, distractedSeconds = 0) => ({
  completed,
  focusSeconds: 1500,
  distractedSeconds,
  artists,
});

describe('focusMusic', () => {
  it('compares the sessions with music and without', () => {
    const result = focusMusic([
      session(['Muse', 'Muse', 'Hans Zimmer'], true, 150),
      session(['Muse'], true),
      session([], false, 750),
      session([], true),
    ]);
    expect(result.withMusic).toEqual({
      sessions: 2,
      focusSeconds: 3000,
      completedPercent: 100,
      distractedPercent: 5,
    });
    expect(result.withoutMusic).toEqual({
      sessions: 2,
      focusSeconds: 3000,
      completedPercent: 50,
      distractedPercent: 25,
    });
    expect(result.artists).toEqual([
      { artist: 'Muse', sessions: 2, plays: 3 },
      { artist: 'Hans Zimmer', sessions: 1, plays: 1 },
    ]);
  });

  it('tells what played while working on each project', () => {
    const result = focusMusic([
      { ...session(['Muse', 'Muse'], true), project: 'Shop' },
      { ...session(['Muse', 'Tool'], true), project: 'Shop' },
      { ...session(['Bonobo'], true), project: null },
      { ...session([], true), project: 'Blog' },
    ]);
    expect(result.byProject).toEqual([
      { project: 'Shop', sessions: 2, artists: ['Muse', 'Tool'] },
      { project: null, sessions: 1, artists: ['Bonobo'] },
    ]);
  });

  it('copes with no sessions', () => {
    expect(focusMusic([]).withMusic).toMatchObject({ sessions: 0, completedPercent: 0 });
  });
});

describe('timeByTitle', () => {
  const titles = [
    { title: 'fix-login — auth.ts — visual studio code', seconds: 1200 },
    { title: 'pull request: fix-login · github', seconds: 300 },
    { title: 'inbox', seconds: 900 },
  ];

  it('sums the windows whose title contains the name', () => {
    expect(timeByTitle(titles, ['fix-login', 'deploy'])).toEqual(new Map([['fix-login', 1500]]));
  });

  it('does not look for a name too short to be told from a word', () => {
    expect(timeByTitle(titles, ['inbox', 'auth'])).toEqual(new Map());
  });
});

describe('timeByName', () => {
  const sessions = [
    { note: 'Fix login', focusSeconds: 1500 },
    { note: 'fix login: the token', focusSeconds: 900 },
    { note: 'UI', focusSeconds: 600 },
    { note: 'build the ui kit', focusSeconds: 300 },
    { note: null, focusSeconds: 1000 },
  ];

  it('sums the sessions whose note is the name or contains it', () => {
    expect(timeByName(sessions, ['fix login', 'other'])).toEqual(new Map([['fix login', 2400]]));
  });

  it('matches a short name only whole', () => {
    expect(timeByName(sessions, ['ui'])).toEqual(new Map([['ui', 600]]));
  });
});

import { CodeAccount, CodeProvider, GithubContributionDay } from '@pd/contracts';
import { mergeDays, summarize } from './summary';

const today = { year: 2026, month: 3, day: 5 };

function account(provider: CodeProvider, days: GithubContributionDay[]) {
  const total = days.reduce((sum, day) => sum + day.count, 0);
  const value: CodeAccount = {
    provider,
    login: provider,
    name: null,
    avatarUrl: null,
    htmlUrl: `https://${provider}.example`,
    joinedAt: '2020-01-01T00:00:00.000Z',
    followers: null,
    following: null,
    repos: 1,
    totalStars: null,
    totalContributions: total,
    today: 0,
    week: 0,
    streak: { current: 0, longest: 0 },
    busiestDay: null,
    years: [
      {
        year: 2026,
        contributions: total,
        commits: total,
        pullRequests: 0,
        reviews: 0,
        issues: 0,
        restricted: 0,
      },
    ],
    languages: [],
    topRepos: [],
    followersHistory: [],
    lastSyncedAt: null,
    syncError: null,
  };
  return { account: value, days };
}

describe('mergeDays', () => {
  it('adds up the same day of several calendars', () => {
    expect(
      mergeDays([
        [{ day: '2026-03-04', count: 2 }],
        [
          { day: '2026-03-03', count: 1 },
          { day: '2026-03-04', count: 5 },
        ],
      ]),
    ).toEqual([
      { day: '2026-03-03', count: 1 },
      { day: '2026-03-04', count: 7 },
    ]);
  });
});

describe('summarize', () => {
  it('keeps the streak alive while any service has a contribution', () => {
    const summary = summarize(
      [
        account('github', [
          { day: '2026-03-03', count: 1 },
          { day: '2026-03-05', count: 2 },
        ]),
        account('gitlab', [{ day: '2026-03-04', count: 4 }]),
      ],
      today,
    );
    expect(summary.streak).toEqual({ current: 3, longest: 3 });
    expect(summary.today).toBe(2);
    expect(summary.totalContributions).toBe(7);
    expect(summary.busiestDay).toEqual({ day: '2026-03-04', count: 4 });
  });

  it('adds the years up and tells how much each service gave', () => {
    const summary = summarize(
      [
        account('github', [{ day: '2026-03-03', count: 3 }]),
        account('bitbucket', [{ day: '2026-03-04', count: 4 }]),
      ],
      today,
    );
    expect(summary.years).toEqual([
      {
        year: 2026,
        contributions: 7,
        commits: 7,
        pullRequests: 0,
        reviews: 0,
        issues: 0,
        byProvider: { github: 3, bitbucket: 4 },
      },
    ]);
    expect(summary.accounts.map((brief) => brief.provider)).toEqual(['github', 'bitbucket']);
  });
});

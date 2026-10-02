import { gitlabActivity } from './gitlab-account.source';

const at = '2026-03-04T10:00:00.000Z';

describe('gitlabActivity', () => {
  it('counts a push as one contribution with all its commits', () => {
    expect(
      gitlabActivity({
        action_name: 'pushed to',
        target_type: null,
        created_at: at,
        push_data: { commit_count: 5 },
      }),
    ).toEqual([{ at: new Date(at), kind: 'commit', contributions: 1, amount: 5 }]);
  });

  it('tells merge requests, issues and reviews apart', () => {
    const kind = (action_name: string, target_type: string | null, noteable_type?: string) =>
      gitlabActivity({ action_name, target_type, created_at: at, note: { noteable_type } })[0]
        ?.kind;
    expect(kind('opened', 'MergeRequest')).toBe('pullRequest');
    expect(kind('opened', 'Issue')).toBe('issue');
    expect(kind('approved', 'MergeRequest')).toBe('review');
    expect(kind('commented on', 'DiffNote')).toBe('review');
    expect(kind('commented on', 'Note', 'MergeRequest')).toBe('review');
    expect(kind('commented on', 'Note', 'Issue')).toBe('other');
    expect(kind('accepted', 'MergeRequest')).toBe('other');
  });

  it('leaves out what is not a contribution', () => {
    expect(gitlabActivity({ action_name: 'joined', target_type: null, created_at: at })).toEqual(
      [],
    );
    expect(gitlabActivity({ action_name: 'deleted', target_type: null, created_at: at })).toEqual(
      [],
    );
  });
});

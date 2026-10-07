import { bitbucketBetween, commitTitle, fromGitlab } from './project-commits';

describe('commits of a project', () => {
  it('takes the first line of a message as the title', () => {
    expect(commitTitle('Fix the cart\n\nThe total was rounded twice.')).toBe('Fix the cart');
  });

  it('reads a GitLab commit', () => {
    expect(
      fromGitlab({
        title: 'Fix the cart',
        committed_date: '2026-10-06T12:00:00.000+02:00',
        web_url: 'https://gitlab.com/roma/shop/-/commit/abc',
      }),
    ).toEqual({
      at: '2026-10-06T10:00:00.000Z',
      title: 'Fix the cart',
      url: 'https://gitlab.com/roma/shop/-/commit/abc',
    });
  });

  it('keeps of the Bitbucket list only what is between the two moments', () => {
    const commit = (date: string, message: string) => ({
      date,
      message,
      links: { html: { href: `https://bitbucket.org/roma/shop/commits/${message}` } },
    });
    const rows = [
      commit('2026-10-07T09:00:00+00:00', 'after'),
      commit('2026-10-06T11:30:00+00:00', 'inside\nwith details'),
      commit('2026-10-05T08:00:00+00:00', 'before'),
    ];
    const found = bitbucketBetween(
      rows,
      new Date('2026-10-05T12:00:00Z'),
      new Date('2026-10-06T12:00:00Z'),
    );
    expect(found).toEqual([
      {
        at: '2026-10-06T11:30:00.000Z',
        title: 'inside',
        url: 'https://bitbucket.org/roma/shop/commits/inside\nwith details',
      },
    ]);
  });
});

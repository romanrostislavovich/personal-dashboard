import { GithubLanguageShare } from '@pd/contracts';
import { AccountSource, ActivityEvent, FetchedAccount } from '../accounts/account-source';
import {
  GITLAB_PAGE,
  GitlabClient,
  RawGitlabEvent,
  RawGitlabProject,
  RawGitlabUser,
} from './gitlab.client';

/** Languages cost a request per project: the most starred ones tell enough. */
const LANGUAGE_PROJECTS = 20;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The GitLab account behind the token. GitLab has no API for its contribution calendar, so the
 * calendar is built from the user's events — the same ones GitLab draws it from. Events are kept
 * by GitLab for three years, which is how far back the first sync reaches.
 */
export class GitlabAccountSource implements AccountSource {
  constructor(private readonly gitlab: GitlabClient) {}

  async getAccount(): Promise<FetchedAccount> {
    const me = await this.me();
    // `/user` leaves the followers out; the public profile has them.
    const profile = await this.gitlab.get<RawGitlabUser>(`/users/${me.id}`);
    const { rows, total } = await this.gitlab.page<RawGitlabProject>('/projects', {
      owned: 'true',
      statistics: 'true',
      order_by: 'star_count',
      per_page: String(GITLAB_PAGE),
    });
    const own = rows.filter((project) => !project.forked_from_project);
    return {
      login: me.username,
      name: me.name,
      avatarUrl: me.avatar_url,
      htmlUrl: me.web_url,
      joinedAt: me.created_at,
      followers: profile?.followers ?? 0,
      following: profile?.following ?? 0,
      // Forks can be told apart only on the page that was read.
      repos: total !== null && total > rows.length ? total : own.length,
      totalStars: own.reduce((sum, project) => sum + project.star_count, 0),
      languages: await this.languages(own.slice(0, LANGUAGE_PROJECTS)),
      topRepos: own.map((project) => ({
        fullName: project.path_with_namespace,
        htmlUrl: project.web_url,
        stars: project.star_count,
        forks: project.forks_count,
        language: null,
        isPrivate: project.visibility !== 'public',
      })),
    };
  }

  async getActivity(since: Date | null): Promise<ActivityEvent[]> {
    const events = await this.gitlab.all<RawGitlabEvent>('/events', {
      sort: 'asc',
      // `after` is a date and leaves that day out.
      ...(since ? { after: new Date(since.getTime() - DAY_MS).toISOString().slice(0, 10) } : {}),
    });
    return events.flatMap(gitlabActivity);
  }

  private async me(): Promise<RawGitlabUser> {
    const me = await this.gitlab.get<RawGitlabUser>('/user');
    if (!me) {
      throw new Error('GitLab did not return the account of the token');
    }
    return me;
  }

  /**
   * GitLab gives the languages of a project in percent; multiplied by the size of its repository
   * they become comparable across projects.
   */
  private async languages(projects: RawGitlabProject[]): Promise<GithubLanguageShare[]> {
    const shares = new Map<string, number>();
    for (const project of projects) {
      const percents = await this.gitlab.get<Record<string, number>>(
        `/projects/${project.id}/languages`,
      );
      const size = project.statistics?.repository_size || 1;
      for (const [name, percent] of Object.entries(percents ?? {})) {
        shares.set(name, (shares.get(name) ?? 0) + (percent / 100) * size);
      }
    }
    return [...shares.entries()]
      .map(([name, bytes]) => ({ name, color: null, bytes: Math.round(bytes) }))
      .sort((a, b) => b.bytes - a.bytes);
  }
}

/** Membership and deletions are on the activity page of GitLab, not in its calendar. */
const NOT_CONTRIBUTIONS = ['joined', 'left', 'deleted', 'destroyed', 'expired', 'removed'];

/**
 * An event as a contribution, the way GitLab's own calendar counts: a push is one contribution
 * whatever the number of its commits, an opened issue or merge request and a comment are one each.
 */
export function gitlabActivity(event: RawGitlabEvent): ActivityEvent[] {
  const action = event.action_name;
  if (NOT_CONTRIBUTIONS.some((skipped) => action.startsWith(skipped))) {
    return [];
  }
  const at = new Date(event.created_at);
  const one = (kind: ActivityEvent['kind'], amount = 1): ActivityEvent[] => [
    { at, kind, contributions: 1, amount },
  ];
  if (action.startsWith('pushed')) {
    return one('commit', event.push_data?.commit_count ?? 0);
  }
  if (action === 'approved') {
    return one('review');
  }
  if (action === 'opened' && event.target_type === 'MergeRequest') {
    return one('pullRequest');
  }
  if (action === 'opened' && event.target_type === 'Issue') {
    return one('issue');
  }
  // A comment on a merge request is the review of it.
  const onMergeRequest =
    event.target_type === 'DiffNote' || event.note?.noteable_type === 'MergeRequest';
  return one(action.startsWith('commented') && onMergeRequest ? 'review' : 'other');
}

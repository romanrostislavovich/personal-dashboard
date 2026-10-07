import { BitbucketClient } from './bitbucket/bitbucket.client';
import { GitlabClient, projectPath } from './gitlab/gitlab.client';

/** A commit as the overview of a project and the incidents of its sites show it. */
export interface RepoCommit {
  at: string;
  title: string;
  url: string | null;
}

/** Commits asked for at once: the latest of the stretch. */
const COMMITS = 30;
/**
 * Bitbucket cannot be asked for a stretch of time: its commits come newest first and are read
 * until the stretch is passed — but no further back than this many.
 */
const BITBUCKET_LOOK_BACK = 500;

/** The first line of a commit message is its title. */
export function commitTitle(message: string): string {
  return message.split('\n')[0].trim().slice(0, 200);
}

export interface RawGitlabCommit {
  title?: string;
  message?: string;
  committed_date: string;
  web_url?: string;
}

export interface RawBitbucketCommit {
  message?: string;
  date: string;
  links?: { html?: { href?: string } };
}

export function fromGitlab(raw: RawGitlabCommit): RepoCommit {
  return {
    at: new Date(raw.committed_date).toISOString(),
    title: commitTitle(raw.title ?? raw.message ?? ''),
    url: raw.web_url ?? null,
  };
}

/** The commits of Bitbucket's newest-first list that fall between two moments. */
export function bitbucketBetween(
  rows: RawBitbucketCommit[],
  since: Date,
  until: Date,
): RepoCommit[] {
  return rows
    .filter((raw) => {
      const at = new Date(raw.date);
      return at >= since && at <= until;
    })
    .slice(0, COMMITS)
    .map((raw) => ({
      at: new Date(raw.date).toISOString(),
      title: commitTitle(raw.message ?? ''),
      url: raw.links?.html?.href ?? null,
    }));
}

/** Commits of the default branch of a GitLab project between two moments, newest first. */
export async function gitlabCommits(
  client: GitlabClient,
  fullName: string,
  since: Date,
  until: Date,
): Promise<RepoCommit[]> {
  const { rows } = await client.page<RawGitlabCommit>(
    `${projectPath(fullName)}/repository/commits`,
    { since: since.toISOString(), until: until.toISOString(), per_page: String(COMMITS) },
  );
  return rows.map(fromGitlab);
}

/** Commits of the main branch of a Bitbucket repository between two moments, newest first. */
export async function bitbucketCommits(
  client: BitbucketClient,
  fullName: string,
  since: Date,
  until: Date,
): Promise<RepoCommit[]> {
  let seen = 0;
  const rows = await client.all<RawBitbucketCommit>(
    `/repositories/${fullName}/commits`,
    { fields: 'next,values.message,values.date,values.links.html.href' },
    (row) => new Date(row.date) < since || ++seen > BITBUCKET_LOOK_BACK,
  );
  return bitbucketBetween(rows, since, until);
}

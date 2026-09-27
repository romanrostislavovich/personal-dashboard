import { pickMessages } from '@pd/api-core';
import { RepoSyncEvents } from './sync/repo-sync.service';

interface Labels {
  stars: (n: number) => string;
  release: string;
  issue: string;
  pull: string;
  by: string;
}

/** One message for all events of all repositories per sync. */
function body(events: RepoSyncEvents[], t: Labels): string {
  return events
    .map((repo) => {
      const lines = [
        repo.starMilestone && `⭐ ${t.stars(repo.starMilestone)}`,
        repo.newRelease && `🚀 ${t.release} ${repo.newRelease.tag}: ${repo.newRelease.htmlUrl}`,
        ...repo.newIssues.map((i) => `📥 ${t.issue} ${t.by} ${i.author}: ${i.title}\n${i.htmlUrl}`),
        ...repo.newPulls.map((p) => `🔀 ${t.pull} ${t.by} ${p.author}: ${p.title}\n${p.htmlUrl}`),
      ].filter(Boolean);
      return `${repo.fullName}\n${lines.join('\n')}`;
    })
    .join('\n\n');
}

/** Module notification texts; the language is picked by `user.locale`. */
const messages = {
  en: {
    title: '🐙 GitHub',
    body: (events: RepoSyncEvents[]) =>
      body(events, {
        stars: (n) => `${n} stars!`,
        release: 'Release',
        issue: 'Issue',
        pull: 'PR',
        by: 'from',
      }),
  },
  ru: {
    title: '🐙 GitHub',
    body: (events: RepoSyncEvents[]) =>
      body(events, {
        stars: (n) => `${n} звёзд!`,
        release: 'Релиз',
        issue: 'Issue',
        pull: 'PR',
        by: 'от',
      }),
  },
};

export function githubOssMessages(locale: string) {
  return pickMessages(messages, locale);
}

export function hasNews(events: RepoSyncEvents): boolean {
  return Boolean(
    events.starMilestone ||
    events.newRelease ||
    events.newIssues.length > 0 ||
    events.newPulls.length > 0,
  );
}

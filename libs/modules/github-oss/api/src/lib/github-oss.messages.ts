import { RepoSyncEvents } from './sync/repo-sync.service';

/** Тексты уведомлений модуля; язык выбирается по `user.locale`. */
const messages = {
  ru: {
    title: '🐙 GitHub',
    /** Одно сообщение на все события всех репозиториев за синхронизацию. */
    body: (events: RepoSyncEvents[]) =>
      events
        .map((repo) => {
          const lines = [
            repo.starMilestone && `⭐ ${repo.starMilestone} звёзд!`,
            repo.newRelease && `🚀 Релиз ${repo.newRelease.tag}: ${repo.newRelease.htmlUrl}`,
            ...repo.newIssues.map((i) => `📥 Issue от ${i.author}: ${i.title}\n${i.htmlUrl}`),
            ...repo.newPulls.map((p) => `🔀 PR от ${p.author}: ${p.title}\n${p.htmlUrl}`),
          ].filter(Boolean);
          return `${repo.fullName}\n${lines.join('\n')}`;
        })
        .join('\n\n'),
  },
};

export function githubOssMessages(locale: string) {
  return messages[locale as keyof typeof messages] ?? messages.ru;
}

export function hasNews(events: RepoSyncEvents): boolean {
  return Boolean(
    events.starMilestone ||
    events.newRelease ||
    events.newIssues.length > 0 ||
    events.newPulls.length > 0,
  );
}

import { FoundProblem, pickMessages } from '@pd/api-core';

/** What GitHub tells about the safety of a repository. */
export interface RepositoryFacts {
  repository: string;
  /** The last run of `.github/workflows/security.yml`; `null` — it never ran. */
  workflow: { conclusion: string | null; at: string; url: string } | null;
  /** Open Dependabot alerts; `null` — not readable (switched off, or the token may not). */
  dependencies: {
    open: number;
    bySeverity: Record<string, number>;
    worst: { package: string; severity: string; summary: string }[];
  } | null;
  /** Open secret scanning alerts; `null` — not readable. */
  secrets: { open: number } | null;
  /** What could not be asked and why (`dependabot: HTTP 403`). */
  unread: string[];
}

const messages = {
  en: {
    workflowMissing: (repository: string) => ({
      title: `${repository}: the security check never ran`,
      details: 'No run of .github/workflows/security.yml was found (leaked secrets, npm audit).',
      fix: 'Push the workflow of this repository (.github/workflows/security.yml) to the default branch; it then runs daily.',
    }),
    workflowFailing: (repository: string, url: string) => ({
      title: `${repository}: the security check fails`,
      details: `The last run found a secret in the history or a serious vulnerability: ${url}`,
      fix: 'Open the run, see which step failed: a leaked secret must be revoked where it was issued (removing it from git is not enough), a vulnerable package updated.',
    }),
    dependencies: (repository: string, counts: string, worst: string) => ({
      title: `${repository}: vulnerable dependencies`,
      details: `Open Dependabot alerts: ${counts}. ${worst}`,
      fix: 'GitHub → the repository → Security → Dependabot: merge the suggested updates or update the packages by hand.',
    }),
    secrets: (repository: string, open: number) => ({
      title: `${repository}: ${open} secret(s) found in the code`,
      details: 'GitHub secret scanning has open alerts: a token or a key is in the repository.',
      fix: 'Revoke each one where it was issued and replace it; then close the alert (GitHub → Security → Secret scanning).',
    }),
  },
  ru: {
    workflowMissing: (repository: string) => ({
      title: `${repository}: проверка безопасности ни разу не запускалась`,
      details: 'Не найдено запусков .github/workflows/security.yml (утёкшие секреты, npm audit).',
      fix: 'Запушьте workflow этого репозитория (.github/workflows/security.yml) в основную ветку; дальше он запускается ежедневно.',
    }),
    workflowFailing: (repository: string, url: string) => ({
      title: `${repository}: проверка безопасности падает`,
      details: `Последний запуск нашёл секрет в истории или серьёзную уязвимость: ${url}`,
      fix: 'Откройте запуск и посмотрите, какой шаг упал: утёкший секрет нужно отозвать там, где он выдан (удалить из git недостаточно), уязвимый пакет — обновить.',
    }),
    dependencies: (repository: string, counts: string, worst: string) => ({
      title: `${repository}: уязвимые зависимости`,
      details: `Открытые предупреждения Dependabot: ${counts}. ${worst}`,
      fix: 'GitHub → репозиторий → Security → Dependabot: примите предложенные обновления или обновите пакеты вручную.',
    }),
    secrets: (repository: string, open: number) => ({
      title: `${repository}: в коде найдены секреты (${open})`,
      details:
        'У GitHub secret scanning есть открытые предупреждения: токен или ключ лежит в репозитории.',
      fix: 'Отзовите каждый там, где он выдан, и замените; затем закройте предупреждение (GitHub → Security → Secret scanning).',
    }),
  },
};

const SEVERITIES = ['critical', 'high', 'medium', 'low'] as const;

/** The rules of a repository: what in GitHub's answers is a problem, and how bad. */
export function repositoryProblems(facts: RepositoryFacts, locale: string): FoundProblem[] {
  const text = pickMessages(messages, locale);
  const { repository, workflow, dependencies, secrets } = facts;
  const problems: FoundProblem[] = [];

  if (!workflow) {
    problems.push({
      key: 'workflow-missing',
      severity: 'info',
      ...text.workflowMissing(repository),
    });
  } else if (workflow.conclusion === 'failure') {
    problems.push({
      key: 'workflow-failing',
      severity: 'high',
      ...text.workflowFailing(repository, workflow.url),
    });
  }
  if (dependencies && dependencies.open > 0) {
    const worst = SEVERITIES.find((severity) => dependencies.bySeverity[severity]) ?? 'low';
    problems.push({
      key: 'dependencies',
      severity: worst,
      ...text.dependencies(
        repository,
        SEVERITIES.filter((severity) => dependencies.bySeverity[severity])
          .map((severity) => `${severity} ${dependencies.bySeverity[severity]}`)
          .join(', '),
        dependencies.worst.map((alert) => `${alert.package} (${alert.severity})`).join(', '),
      ),
    });
  }
  if (secrets && secrets.open > 0) {
    problems.push({
      key: 'secrets',
      severity: 'critical',
      ...text.secrets(repository, secrets.open),
    });
  }
  return problems;
}

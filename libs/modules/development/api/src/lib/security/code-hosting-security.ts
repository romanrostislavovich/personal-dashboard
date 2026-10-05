import { FoundProblem, pickMessages } from '@pd/api-core';

export type CodeHosting = 'github' | 'gitlab' | 'bitbucket';

/** What a hosting tells about the safety of one repository (GitHub only tells this much). */
export interface RepositoryFacts {
  name: string;
  /** Open Dependabot alerts by severity; `null` — not readable (off, or the token may not). */
  dependencies: Record<string, number> | null;
  /** Open secret scanning alerts; `null` — not readable. */
  secrets: number | null;
  /** The last run of `.github/workflows/security.yml`; `null` — the repository has none. */
  securityCheck: { conclusion: string | null; url: string } | null;
}

/** A connected code hosting: the account, the token the dashboard reads it with, its repositories. */
export interface HostingFacts {
  hosting: CodeHosting;
  account: {
    login: string | null;
    /** `null` — the hosting does not tell (or the token may not ask). */
    twoFactor: boolean | null;
  };
  token: {
    /** `null` — it does not expire, or the hosting does not tell. */
    expiresAt: string | null;
    /** What the token may do; `null` — the hosting does not tell. */
    scopes: string[] | null;
  };
  /** The user's own repositories that were looked at (the most recently pushed ones). */
  repositories: RepositoryFacts[];
}

const NAMES: Record<CodeHosting, string> = {
  github: 'GitHub',
  gitlab: 'GitLab',
  bitbucket: 'Bitbucket',
};

/**
 * Scopes that let a token change or destroy things. The dashboard only reads, so a token with
 * one of them risks more than it needs to, should the dashboard's secrets ever leak.
 */
const BROAD_SCOPES: Record<CodeHosting, RegExp> = {
  github: /^(delete_repo|admin:.+|write:org|site_admin)$/,
  gitlab: /^(api|write_repository|sudo|admin_mode)$/,
  bitbucket: /^$/,
};
const TOKEN_EXPIRES_SOON_DAYS = 14;
const SEVERITIES = ['critical', 'high', 'medium', 'low'] as const;

const messages = {
  en: {
    twoFactorOff: (hosting: string, login: string) => ({
      title: `${hosting}: two-factor sign-in is off`,
      details: `The account ${login} is protected by the password alone — and it holds your code.`,
      fix: `${hosting} → the account's settings → Password and authentication (Security) → turn on two-factor authentication.`,
    }),
    tokenExpired: (hosting: string) => ({
      title: `${hosting}: the dashboard's token has expired`,
      details: 'The dashboard can no longer read this account: its data stopped updating.',
      fix: `Create a new token on ${hosting} and save it in Settings → Integrations.`,
    }),
    tokenExpiring: (hosting: string, days: number) => ({
      title: `${hosting}: the dashboard's token expires in ${days} day(s)`,
      details: 'After that the dashboard stops reading this account.',
      fix: `Create a new token on ${hosting} ahead of time and save it in Settings → Integrations.`,
    }),
    tokenBroad: (hosting: string, scopes: string[]) => ({
      title: `${hosting}: the dashboard's token may do more than read`,
      details: `Its scopes include: ${scopes.join(', ')}. The dashboard only reads.`,
      fix: `Create a token with read-only scopes on ${hosting}, save it in Settings → Integrations and delete the old one.`,
    }),
    dependencies: (repository: string, counts: string) => ({
      title: `${repository}: vulnerable dependencies`,
      details: `Open Dependabot alerts: ${counts}.`,
      fix: 'GitHub → the repository → Security → Dependabot: merge the suggested updates or update the packages by hand.',
    }),
    secrets: (repository: string, open: number) => ({
      title: `${repository}: ${open} secret(s) found in the code`,
      details: 'GitHub secret scanning has open alerts: a token or a key is in the repository.',
      fix: 'Revoke each one where it was issued and replace it (removing it from git is not enough); then close the alert in GitHub → Security → Secret scanning.',
    }),
    checkFailing: (repository: string, url: string) => ({
      title: `${repository}: the security check fails`,
      details: `The last run of its security workflow found a secret in the history or a serious vulnerability: ${url}`,
      fix: 'Open the run and see which step failed: a leaked secret must be revoked where it was issued, a vulnerable package updated.',
    }),
    alertsUnreadable: (count: number) => ({
      title: 'GitHub does not show the alerts of your repositories',
      details: `Dependabot alerts could not be read for any of the ${count} repositories: they are switched off, or the token lacks the right.`,
      fix: 'Turn Dependabot alerts on (GitHub → Settings → Code security) and give the token the `security_events` scope (a fine-grained one: "Dependabot alerts: read").',
    }),
  },
  ru: {
    twoFactorOff: (hosting: string, login: string) => ({
      title: `${hosting}: двухфакторный вход выключен`,
      details: `Аккаунт ${login} защищён только паролем — а в нём ваш код.`,
      fix: `${hosting} → настройки аккаунта → Password and authentication (Security) → включите двухфакторную аутентификацию.`,
    }),
    tokenExpired: (hosting: string) => ({
      title: `${hosting}: токен дашборда истёк`,
      details: 'Дашборд больше не может читать этот аккаунт: его данные перестали обновляться.',
      fix: `Создайте новый токен на ${hosting} и сохраните его в Настройках → Интеграции.`,
    }),
    tokenExpiring: (hosting: string, days: number) => ({
      title: `${hosting}: токен дашборда истекает через ${days} дн.`,
      details: 'После этого дашборд перестанет читать этот аккаунт.',
      fix: `Создайте новый токен на ${hosting} заранее и сохраните его в Настройках → Интеграции.`,
    }),
    tokenBroad: (hosting: string, scopes: string[]) => ({
      title: `${hosting}: токен дашборда умеет больше, чем читать`,
      details: `Среди его прав: ${scopes.join(', ')}. Дашборд только читает.`,
      fix: `Создайте на ${hosting} токен только с правами на чтение, сохраните его в Настройках → Интеграции и удалите старый.`,
    }),
    dependencies: (repository: string, counts: string) => ({
      title: `${repository}: уязвимые зависимости`,
      details: `Открытые предупреждения Dependabot: ${counts}.`,
      fix: 'GitHub → репозиторий → Security → Dependabot: примите предложенные обновления или обновите пакеты вручную.',
    }),
    secrets: (repository: string, open: number) => ({
      title: `${repository}: в коде найдены секреты (${open})`,
      details:
        'У GitHub secret scanning есть открытые предупреждения: токен или ключ лежит в репозитории.',
      fix: 'Отзовите каждый там, где он выдан, и замените (удалить из git недостаточно); затем закройте предупреждение в GitHub → Security → Secret scanning.',
    }),
    checkFailing: (repository: string, url: string) => ({
      title: `${repository}: проверка безопасности падает`,
      details: `Последний запуск security-workflow нашёл секрет в истории или серьёзную уязвимость: ${url}`,
      fix: 'Откройте запуск и посмотрите, какой шаг упал: утёкший секрет нужно отозвать там, где он выдан, уязвимый пакет — обновить.',
    }),
    alertsUnreadable: (count: number) => ({
      title: 'GitHub не показывает предупреждения ваших репозиториев',
      details: `Предупреждения Dependabot не удалось прочитать ни для одного из репозиториев (${count}): они выключены или токену не хватает прав.`,
      fix: 'Включите Dependabot alerts (GitHub → Settings → Code security) и дайте токену право `security_events` (для fine-grained: «Dependabot alerts: read»).',
    }),
  },
};

/** The rules of the code hostings: what in their answers is a problem, and how bad. */
export function hostingProblems(
  hostings: HostingFacts[],
  locale: string,
  now: Date,
): FoundProblem[] {
  const text = pickMessages(messages, locale);
  const problems: FoundProblem[] = [];
  for (const { hosting, account, token, repositories } of hostings) {
    const name = NAMES[hosting];
    if (account.twoFactor === false) {
      problems.push({
        key: `${hosting}.two-factor-off`,
        severity: 'medium',
        ...text.twoFactorOff(name, account.login ?? '?'),
      });
    }
    if (token.expiresAt) {
      const days = Math.floor((Date.parse(token.expiresAt) - now.getTime()) / 86_400_000);
      if (days < 0) {
        problems.push({
          key: `${hosting}.token-expired`,
          severity: 'medium',
          ...text.tokenExpired(name),
        });
      } else if (days <= TOKEN_EXPIRES_SOON_DAYS) {
        problems.push({
          key: `${hosting}.token-expiring`,
          severity: 'low',
          ...text.tokenExpiring(name, days),
        });
      }
    }
    const broad = (token.scopes ?? []).filter((scope) => BROAD_SCOPES[hosting].test(scope));
    if (broad.length) {
      problems.push({
        key: `${hosting}.token-broad`,
        severity: 'low',
        ...text.tokenBroad(name, broad),
      });
    }

    for (const repository of repositories) {
      const found = repository.dependencies;
      const worst = found && SEVERITIES.find((severity) => found[severity]);
      if (found && worst) {
        problems.push({
          key: `${hosting}.${repository.name}.dependencies`,
          severity: worst,
          ...text.dependencies(
            repository.name,
            SEVERITIES.filter((severity) => found[severity])
              .map((severity) => `${severity} ${found[severity]}`)
              .join(', '),
          ),
        });
      }
      if (repository.secrets) {
        problems.push({
          key: `${hosting}.${repository.name}.secrets`,
          severity: 'critical',
          ...text.secrets(repository.name, repository.secrets),
        });
      }
      if (repository.securityCheck?.conclusion === 'failure') {
        problems.push({
          key: `${hosting}.${repository.name}.check-failing`,
          severity: 'high',
          ...text.checkFailing(repository.name, repository.securityCheck.url),
        });
      }
    }
    if (
      repositories.length &&
      repositories.every((repository) => repository.dependencies === null)
    ) {
      problems.push({
        key: `${hosting}.alerts-unreadable`,
        severity: 'info',
        ...text.alertsUnreadable(repositories.length),
      });
    }
  }
  return problems;
}

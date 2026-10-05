import { FoundProblem } from './security-source';
import { SecurityMessages } from './security.messages';

/** What the dashboard knows about its own safety. Nothing here is a secret: the AI reads it. */
export interface AppFacts {
  account: { twoFactor: boolean; users: number; registrationOpen: boolean };
  signIns: {
    /** Failed attempts of the last 24 hours. */
    failed: number;
    failedByAddress: { ip: string; count: number }[];
    /** A good sign-in right after several bad ones from the same address. */
    guessed: { ip: string; email: string; at: string; failuresBefore: number }[];
    /** Addresses that signed in this week and never in the months before. */
    newAddresses: { ip: string; userAgent: string | null; at: string }[];
  };
  sessions: { total: number; idleOverMonth: number };
  /** The dashboard's public address; `null` — it is a local one, there is nothing to check. */
  site: {
    url: string;
    https: boolean;
    /** `null` — not HTTPS, or the certificate could not be read. */
    certificateDaysLeft: number | null;
    missingHeaders: string[];
    error: string | null;
  } | null;
  backups: { watched: boolean; latestAt: string | null; problems: string[] };
  /** `npm audit` written into the image when it was built; `null` — run from the sources. */
  dependencies: {
    auditedAt: string;
    critical: number;
    high: number;
    moderate: number;
    low: number;
  } | null;
}

/** Failed sign-ins a day worth telling about, and a lot of them. */
const FAILURES_NOTICED = 20;
const FAILURES_MANY = 200;
const CERTIFICATE_SOON_DAYS = 21;
const CERTIFICATE_URGENT_DAYS = 7;

/** The rules of the dashboard itself: what in the facts is a problem, and how bad. */
export function appProblems(facts: AppFacts, text: SecurityMessages): FoundProblem[] {
  const problems: FoundProblem[] = [];
  const { account, signIns, sessions, site, backups, dependencies } = facts;

  if (!account.twoFactor) {
    problems.push({ key: 'app.two-factor-off', severity: 'medium', ...text.twoFactorOff() });
  }
  if (account.registrationOpen) {
    problems.push({
      key: 'app.registration-open',
      severity: 'low',
      ...text.registrationOpen(account.users),
    });
  }
  if (signIns.guessed.length) {
    problems.push({
      key: 'app.sign-in-guessed',
      severity: 'critical',
      ...text.signInGuessed(
        signIns.guessed.map((g) => `${g.email} ← ${g.ip} (${g.failuresBefore}×, ${g.at})`),
      ),
    });
  }
  if (signIns.failed >= FAILURES_NOTICED) {
    problems.push({
      key: 'app.sign-in-failures',
      severity: signIns.failed >= FAILURES_MANY ? 'high' : 'medium',
      ...text.signInFailures(
        signIns.failed,
        signIns.failedByAddress.slice(0, 5).map((a) => `${a.ip} (${a.count})`),
      ),
    });
  }
  if (signIns.newAddresses.length) {
    problems.push({
      key: 'app.new-address',
      severity: 'low',
      ...text.newAddress(signIns.newAddresses.map((a) => `${a.ip} (${a.at})`)),
    });
  }
  if (sessions.idleOverMonth > 0) {
    problems.push({
      key: 'app.sessions-idle',
      severity: 'low',
      ...text.sessionsIdle(sessions.idleOverMonth),
    });
  }

  if (site) {
    if (!site.https) {
      problems.push({ key: 'app.no-https', severity: 'high', ...text.noHttps(site.url) });
    } else if (site.error) {
      problems.push({
        key: 'app.site-unreachable',
        severity: 'medium',
        ...text.siteUnreachable(site.url, site.error),
      });
    } else {
      const days = site.certificateDaysLeft;
      if (days !== null && days <= CERTIFICATE_SOON_DAYS) {
        problems.push({
          key: 'app.certificate-expiring',
          severity: days <= CERTIFICATE_URGENT_DAYS ? 'high' : 'medium',
          ...text.certificateExpiring(days),
        });
      }
      if (site.missingHeaders.length) {
        problems.push({
          key: 'app.headers-missing',
          severity: 'low',
          ...text.headersMissing(site.missingHeaders),
        });
      }
    }
  }

  if (!backups.watched) {
    problems.push({ key: 'app.backups-off', severity: 'medium', ...text.backupsOff() });
  } else if (backups.problems.length) {
    problems.push({
      key: 'app.backups-broken',
      severity: 'high',
      ...text.backupsBroken(backups.problems),
    });
  }

  if (dependencies && dependencies.critical + dependencies.high + dependencies.moderate > 0) {
    const { critical, high, moderate, low, auditedAt } = dependencies;
    problems.push({
      key: 'app.dependencies',
      severity: critical ? 'critical' : high ? 'high' : 'low',
      ...text.dependencies(
        `critical ${critical}, high ${high}, moderate ${moderate}, low ${low}`,
        auditedAt.slice(0, 10),
      ),
    });
  }
  return problems;
}

/** A sign-in as the journal keeps it (see SignInLog). */
export interface SignInAttempt {
  email: string;
  outcome: string;
  ip: string | null;
  at: Date;
  userAgent: string | null;
}

const DAY_MS = 86_400_000;
/** This many wrong passwords from an address within the hour before a good one look like guessing. */
const GUESS_FAILURES = 5;
const GUESS_WINDOW_MS = 3_600_000;
/** "New" is an address of this week that the months before never saw. */
const NEW_ADDRESS_DAYS = 7;

/** What the journal of sign-ins tells: the failures of a day, guessing that worked, new addresses. */
export function summarizeSignIns(attempts: SignInAttempt[], now: Date): AppFacts['signIns'] {
  const failed = attempts.filter(
    (a) => a.outcome !== 'ok' && now.getTime() - a.at.getTime() <= DAY_MS,
  );
  const byAddress = new Map<string, number>();
  for (const attempt of failed) {
    const ip = attempt.ip ?? 'unknown';
    byAddress.set(ip, (byAddress.get(ip) ?? 0) + 1);
  }

  const good = attempts.filter((a) => a.outcome === 'ok');
  const guessed = good
    .filter((a) => now.getTime() - a.at.getTime() <= NEW_ADDRESS_DAYS * DAY_MS)
    .map((success) => ({
      success,
      failuresBefore: attempts.filter(
        (a) =>
          a.outcome !== 'ok' &&
          a.ip === success.ip &&
          a.at < success.at &&
          success.at.getTime() - a.at.getTime() <= GUESS_WINDOW_MS,
      ).length,
    }))
    .filter(({ failuresBefore }) => failuresBefore >= GUESS_FAILURES)
    .map(({ success, failuresBefore }) => ({
      ip: success.ip ?? 'unknown',
      email: success.email,
      at: success.at.toISOString(),
      failuresBefore,
    }));

  const weekAgo = now.getTime() - NEW_ADDRESS_DAYS * DAY_MS;
  const before = new Set(good.filter((a) => a.at.getTime() < weekAgo).map((a) => a.ip));
  // Without older sign-ins every address is new: the journal has only just begun.
  const fresh = new Map<string, SignInAttempt>();
  if (before.size) {
    for (const attempt of good.filter((a) => a.at.getTime() >= weekAgo && !before.has(a.ip))) {
      fresh.set(attempt.ip ?? 'unknown', attempt);
    }
  }

  return {
    failed: failed.length,
    failedByAddress: [...byAddress]
      .map(([ip, count]) => ({ ip, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10),
    guessed,
    newAddresses: [...fresh].map(([ip, attempt]) => ({
      ip,
      userAgent: attempt.userAgent,
      at: attempt.at.toISOString(),
    })),
  };
}

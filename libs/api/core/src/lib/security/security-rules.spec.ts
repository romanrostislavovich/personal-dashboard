import {
  AppFacts,
  appProblems,
  ownAddresses,
  SignedInDevice,
  SignInAttempt,
  summarizeSignIns,
} from './app-security.rules';
import { HostReport, hostProblems, hostReportSchema } from './host-security.rules';
import { securityMessages } from './security.messages';

const text = securityMessages('en');
const now = new Date('2026-10-05T12:00:00Z');
const ago = (minutes: number) => new Date(now.getTime() - minutes * 60_000);
const keys = (problems: { key: string }[]) => problems.map((problem) => problem.key);
const DAY = 60 * 24;

const attempt = (outcome: string, ip: string, minutes: number): SignInAttempt => ({
  email: 'me@example.com',
  outcome,
  ip,
  at: ago(minutes),
  userAgent: 'browser',
});
/** A device signed in from an address so many minutes ago. */
const device = (ip: string, minutes: number): SignedInDevice => ({
  ip,
  userAgent: 'Desktop app',
  createdAt: ago(minutes),
});
const summarize = (attempts: SignInAttempt[], devices: SignedInDevice[] = []) =>
  summarizeSignIns(attempts, devices, now);

describe('summarizeSignIns', () => {
  it('counts the failures of the last day by address', () => {
    const summary = summarize([
      attempt('wrong-password', '1.1.1.1', 10),
      attempt('wrong-password', '1.1.1.1', 20),
      attempt('wrong-code', '2.2.2.2', 30),
      attempt('wrong-password', '3.3.3.3', 60 * 30), // Yesterday and more.
    ]);
    expect(summary.failed).toBe(3);
    expect(summary.failedForeign).toBe(3);
    expect(summary.failedByAddress[0]).toEqual({ ip: '1.1.1.1', count: 2, own: false });
  });

  it('notices a sign-in that worked right after failures from the same address', () => {
    const failures = [1, 2, 3, 4, 5].map((n) => attempt('wrong-password', '6.6.6.6', 10 + n));
    const summary = summarize([attempt('ok', '6.6.6.6', 5), ...failures]);
    expect(summary.guessed).toEqual([
      { ip: '6.6.6.6', email: 'me@example.com', at: ago(5).toISOString(), failuresBefore: 5 },
    ]);
    // One's own mistyped password is not guessing.
    const typo = summarize([attempt('ok', '6.6.6.6', 5), attempt('wrong-password', '6.6.6.6', 6)]);
    expect(typo.guessed).toEqual([]);
  });

  it('takes the owner’s own address for the owner', () => {
    const failures = [1, 2, 3, 4, 5, 6].map((n) => attempt('wrong-password', '7.7.7.7', 10 + n));
    const attempts = [attempt('ok', '7.7.7.7', 5), ...failures];
    // A device has been signed in from there for a week: these are the owner's typos.
    const home = summarize(attempts, [device('7.7.7.7', 7 * DAY)]);
    expect(home.guessed).toEqual([]);
    expect(home.failed).toBe(6);
    expect(home.failedForeign).toBe(0);
    expect(home.failedByAddress[0]).toEqual({ ip: '7.7.7.7', count: 6, own: true });
    // An earlier sign-in from there does the same.
    expect(summarize([...attempts, attempt('ok', '7.7.7.7', 3 * DAY)]).guessed).toEqual([]);
  });

  it('does not let a sign-in make its own address trusted', () => {
    const failures = [1, 2, 3, 4, 5].map((n) => attempt('wrong-password', '6.6.6.6', 10 + n));
    // The session the guessed password opened is minutes old: it proves nothing.
    const summary = summarize([attempt('ok', '6.6.6.6', 5), ...failures], [device('6.6.6.6', 5)]);
    expect(summary.guessed).toHaveLength(1);
    expect(summary.failedForeign).toBe(5);
  });

  it('tells a new address only against older sign-ins', () => {
    const month = DAY * 30;
    const known = summarize([attempt('ok', '1.1.1.1', month), attempt('ok', '9.9.9.9', 60)]);
    expect(known.newAddresses.map((a) => a.ip)).toEqual(['9.9.9.9']);
    const sameAsBefore = summarize([attempt('ok', '1.1.1.1', month), attempt('ok', '1.1.1.1', 60)]);
    expect(sameAsBefore.newAddresses).toEqual([]);
    // A journal that has only just begun knows no "before".
    expect(summarize([attempt('ok', '9.9.9.9', 60)]).newAddresses).toEqual([]);
    // An address a device has long been signed in from is not new, whatever the journal says.
    const attempts = [attempt('ok', '1.1.1.1', month), attempt('ok', '9.9.9.9', 60)];
    expect(summarize(attempts, [device('9.9.9.9', 3 * DAY)]).newAddresses).toEqual([]);
  });
});

describe('ownAddresses', () => {
  it('lists the addresses of devices and sign-ins older than a day, with their devices', () => {
    const own = ownAddresses(
      [attempt('ok', '2.2.2.2', 2 * DAY), attempt('ok', '3.3.3.3', 30)],
      [device('1.1.1.1', 5 * DAY), device('4.4.4.4', 10)],
      now,
    );
    expect(own).toEqual([
      { ip: '1.1.1.1', devices: ['Desktop app'] },
      { ip: '2.2.2.2', devices: [] },
    ]);
  });
});

const calm: AppFacts = {
  account: { twoFactor: true, users: 1, registrationOpen: false },
  ownAddresses: [],
  signIns: { failed: 0, failedForeign: 0, failedByAddress: [], guessed: [], newAddresses: [] },
  sessions: { total: 2, idleOverMonth: 0 },
  site: {
    url: 'https://dash.example',
    https: true,
    certificateDaysLeft: 60,
    missingHeaders: [],
    error: null,
  },
  backups: { watched: true, latestAt: now.toISOString(), problems: [] },
  dependencies: { auditedAt: now.toISOString(), critical: 0, high: 0, moderate: 0, low: 2 },
};

describe('appProblems', () => {
  it('finds nothing in a dashboard that is in order', () => {
    expect(appProblems(calm, text)).toEqual([]);
  });

  it('grades what it finds', () => {
    const problems = appProblems(
      {
        ...calm,
        account: { twoFactor: false, users: 3, registrationOpen: true },
        signIns: {
          failed: 250,
          failedForeign: 250,
          failedByAddress: [{ ip: '6.6.6.6', count: 250, own: false }],
          guessed: [{ ip: '6.6.6.6', email: 'me@example.com', at: 'now', failuresBefore: 7 }],
          newAddresses: [],
        },
        sessions: { total: 4, idleOverMonth: 2 },
        site: { ...calm.site!, certificateDaysLeft: 3, missingHeaders: ['referrer-policy'] },
        backups: { watched: true, latestAt: null, problems: ['missing'] },
        dependencies: { auditedAt: now.toISOString(), critical: 1, high: 4, moderate: 0, low: 0 },
      },
      text,
    );
    expect(Object.fromEntries(problems.map((p) => [p.key, p.severity]))).toEqual({
      'app.two-factor-off': 'medium',
      'app.registration-open': 'low',
      'app.sign-in-guessed': 'critical',
      'app.sign-in-failures': 'high',
      'app.sessions-idle': 'low',
      'app.certificate-expiring': 'high',
      'app.headers-missing': 'low',
      'app.backups-broken': 'high',
      'app.dependencies': 'critical',
    });
  });

  it('tells plain HTTP and nothing more about such a site', () => {
    const site = { ...calm.site!, https: false, certificateDaysLeft: null };
    expect(keys(appProblems({ ...calm, site }, text))).toEqual(['app.no-https']);
  });

  it('does not check the site of a local instance', () => {
    const local = {
      ...calm,
      site: null,
      backups: { watched: false, latestAt: null, problems: [] },
    };
    expect(keys(appProblems(local, text))).toEqual(['app.backups-off']);
  });
});

const host: HostReport = {
  at: ago(20).toISOString(),
  os: 'Ubuntu 24.04',
  ssh: {
    passwordAuthentication: false,
    permitRootLogin: 'prohibit-password',
    failed24h: 4000,
    accepted: [],
  },
  firewall: { active: true, tool: 'ufw' },
  listening: [
    { port: 22, protocol: 'tcp', address: '0.0.0.0', process: 'sshd' },
    { port: 443, protocol: 'tcp', address: '0.0.0.0', process: 'docker-proxy' },
    { port: 443, protocol: 'udp', address: '0.0.0.0', process: 'docker-proxy' },
  ],
  updates: { pending: 0, security: 0, rebootRequired: false, automatic: true },
  fail2ban: true,
  diskUsedPercent: 41,
};

describe('hostProblems', () => {
  it('finds nothing on a server that is in order', () => {
    expect(hostProblems(host, text, now)).toEqual([]);
  });

  it('grades what it finds', () => {
    const problems = hostProblems(
      {
        ...host,
        ssh: { ...host.ssh, passwordAuthentication: true, permitRootLogin: 'yes' },
        firewall: { active: false, tool: null },
        listening: [
          ...host.listening,
          { port: 5432, protocol: 'tcp', address: '0.0.0.0', process: 'postgres' },
        ],
        updates: { pending: 30, security: 4, rebootRequired: true, automatic: false },
        fail2ban: false,
        diskUsedPercent: 93,
      },
      text,
      now,
    );
    expect(Object.fromEntries(problems.map((p) => [p.key, p.severity]))).toEqual({
      'host.ssh-password': 'high',
      'host.ssh-root': 'medium',
      'host.firewall-off': 'high',
      'host.open-ports': 'medium',
      'host.ssh-failures': 'medium',
      'host.updates-pending': 'medium',
      'host.reboot-required': 'low',
      'host.updates-manual': 'low',
      'host.disk': 'high',
    });
    expect(problems.find((p) => p.key === 'host.open-ports')?.details).toContain(
      '5432/tcp (postgres)',
    );
  });

  it('reports only the staleness of an old report', () => {
    const old = { ...host, at: ago(60 * 9).toISOString(), firewall: { active: false, tool: null } };
    expect(keys(hostProblems(old, text, now))).toEqual(['host.report-stale']);
  });

  it('reads a report where the script could not tell some things', () => {
    const report = hostReportSchema.parse({
      at: now.toISOString(),
      os: 'Debian',
      ssh: {
        passwordAuthentication: null,
        permitRootLogin: null,
        failed24h: null,
        accepted: 'oops',
      },
      firewall: { active: null, tool: null },
      listening: [],
      updates: { pending: null, security: null, rebootRequired: false, automatic: null },
      fail2ban: null,
      diskUsedPercent: null,
    });
    expect(report.ssh.accepted).toEqual([]);
    expect(hostProblems(report, text, now)).toEqual([]);
  });
});

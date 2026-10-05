import { z } from 'zod';
import { FoundProblem } from './security-source';
import { SecurityMessages } from './security.messages';

const flag = z.boolean().nullable().catch(null);
const count = z.number().int().min(0).nullable().catch(null);

/**
 * What `deploy/security-scan.sh` writes about the server every hour (`host.json`). The script
 * runs on the host itself — the dashboard lives in a container and cannot see the host's
 * firewall, ports or sign-ins. `null` — the script could not tell (a tool is missing).
 */
export const hostReportSchema = z.object({
  at: z.iso.datetime(),
  os: z.string().max(200).catch(''),
  ssh: z.object({
    passwordAuthentication: flag,
    /** `yes`, `no`, `prohibit-password` (a key only)… */
    permitRootLogin: z.string().max(40).nullable().catch(null),
    /** Failed sign-ins of the last 24 hours. */
    failed24h: count,
    /** The last sign-ins that worked. */
    accepted: z
      .array(z.object({ user: z.string().max(60), ip: z.string().max(60), at: z.string().max(40) }))
      .max(20)
      .catch([]),
  }),
  firewall: z.object({ active: flag, tool: z.string().max(40).nullable().catch(null) }),
  /** Sockets listening on other than the loopback address. */
  listening: z
    .array(
      z.object({
        port: z.number().int().min(1).max(65535),
        protocol: z.enum(['tcp', 'udp']),
        address: z.string().max(60),
        process: z.string().max(60).nullable().catch(null),
      }),
    )
    .max(200)
    .catch([]),
  updates: z.object({
    pending: count,
    security: count,
    rebootRequired: z.boolean().catch(false),
    /** unattended-upgrades is enabled. */
    automatic: flag,
  }),
  fail2ban: flag,
  diskUsedPercent: z.number().min(0).max(100).nullable().catch(null),
});
export type HostReport = z.infer<typeof hostReportSchema>;

/** The scan runs every hour: a report this old means it has stopped. */
const STALE_HOURS = 6;
/**
 * What a web server with SSH is expected to have open; 68/udp is the DHCP client of the
 * server's own network interface, not a service.
 */
const EXPECTED_PORTS = new Set(['tcp/22', 'tcp/80', 'tcp/443', 'udp/443', 'udp/68']);
const SSH_FAILURES_NOTICED = 100;
const DISK_HIGH = 90;
const DISK_MEDIUM = 80;

/** The rules of the server: what in the host's report is a problem, and how bad. */
export function hostProblems(
  report: HostReport,
  text: SecurityMessages,
  now: Date,
): FoundProblem[] {
  const problems: FoundProblem[] = [];
  const hours = Math.floor((now.getTime() - Date.parse(report.at)) / 3_600_000);
  if (hours >= STALE_HOURS) {
    // What follows is about a server as it was: only the staleness is reported.
    return [{ key: 'host.report-stale', severity: 'medium', ...text.hostStale(hours) }];
  }

  const { ssh, firewall, updates } = report;
  if (ssh.passwordAuthentication) {
    problems.push({ key: 'host.ssh-password', severity: 'high', ...text.sshPassword() });
  }
  if (ssh.permitRootLogin === 'yes') {
    problems.push({ key: 'host.ssh-root', severity: 'medium', ...text.sshRoot() });
  }
  if (firewall.active === false) {
    problems.push({ key: 'host.firewall-off', severity: 'high', ...text.firewallOff() });
  }
  const unexpected = [
    ...new Set(
      report.listening
        .filter((socket) => !EXPECTED_PORTS.has(`${socket.protocol}/${socket.port}`))
        .map(
          (socket) =>
            `${socket.port}/${socket.protocol}` + (socket.process ? ` (${socket.process})` : ''),
        ),
    ),
  ];
  if (unexpected.length) {
    problems.push({
      key: 'host.open-ports',
      // Behind a firewall they are closed all the same; without one they are reachable.
      severity: firewall.active ? 'low' : 'medium',
      ...text.openPorts(unexpected),
    });
  }
  if ((ssh.failed24h ?? 0) >= SSH_FAILURES_NOTICED && report.fail2ban === false) {
    problems.push({
      key: 'host.ssh-failures',
      severity: ssh.passwordAuthentication ? 'medium' : 'info',
      ...text.sshFailures(ssh.failed24h ?? 0),
    });
  }
  if ((updates.security ?? 0) > 0) {
    problems.push({
      key: 'host.updates-pending',
      severity: 'medium',
      ...text.updatesPending(updates.security ?? 0, updates.pending ?? 0),
    });
  }
  if (updates.rebootRequired) {
    problems.push({ key: 'host.reboot-required', severity: 'low', ...text.rebootRequired() });
  }
  if (updates.automatic === false) {
    problems.push({ key: 'host.updates-manual', severity: 'low', ...text.updatesManual() });
  }
  const disk = report.diskUsedPercent;
  if (disk !== null && disk >= DISK_MEDIUM) {
    problems.push({
      key: 'host.disk',
      severity: disk >= DISK_HIGH ? 'high' : 'medium',
      ...text.hostDisk(Math.round(disk)),
    });
  }
  return problems;
}

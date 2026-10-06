import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { eq } from 'drizzle-orm';
import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { sessions } from '../auth/auth.schema';
import { TwoFactorService } from '../auth/two-factor.service';
import { BackupService } from '../backup/backup.service';
import { AppConfig } from '../config/env';
import { DB, Database } from '../database/database.module';
import { UsersService } from '../users/users.service';
import {
  AppFacts,
  appProblems,
  OwnAddress,
  ownAddresses,
  SignedInDevice,
  SignInAttempt,
  summarizeSignIns,
} from './app-security.rules';
import { hostProblems, hostReportSchema } from './host-security.rules';
import { Inspection } from './security-source';
import { securityMessages } from './security.messages';
import { SecurityService } from './security.service';
import { SignInLog } from './sign-in-log.service';
import { checkSite } from './site-check';

const DAY_MS = 86_400_000;
/** How far back the journal of sign-ins is read: new addresses are told against it. */
const SIGN_IN_DAYS = 90;
const IDLE_SESSION_DAYS = 30;
/** `npm audit --json` of the build, next to the server's code (see the Dockerfile). */
const AUDIT_FILE = 'npm-audit.json';
/** The report `deploy/security-scan.sh` writes into SECURITY_DIR. */
const HOST_REPORT = 'host.json';

/** What the core itself gives the security agent: the dashboard and the server it runs on. */
@Injectable()
export class CoreSecuritySources implements OnModuleInit {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(ConfigService) private readonly config: AppConfig,
    private readonly security: SecurityService,
    private readonly signIns: SignInLog,
    private readonly twoFactor: TwoFactorService,
    private readonly users: UsersService,
    private readonly backups: BackupService,
  ) {}

  onModuleInit(): void {
    this.security.registerSource({
      id: 'dashboard',
      area: 'app',
      description:
        'The dashboard itself: whether two-factor sign-in is on and registration open; failed ' +
        'sign-ins of the last day by address, sign-ins that worked right after failures, ' +
        "addresses new this week; `ownAddresses` — the addresses the owner's own signed-in " +
        'devices use; signed-in devices; the public site (HTTPS, days the ' +
        'certificate lasts, missing security headers); backups; npm audit of the build.',
      inspect: (userId, locale) => this.dashboard(userId, locale),
    });
    this.security.registerSource({
      id: 'server',
      area: 'host',
      description:
        'The server (host) as its hourly scan saw it: SSH settings, failed SSH sign-ins of ' +
        'the last day and the last ones that worked (`own: true` — from an address of the ' +
        "owner's own devices), the firewall, sockets listening on " +
        'public addresses with their processes, pending updates, fail2ban, the disk.',
      inspect: (userId, locale) => this.server(userId, locale),
    });
  }

  private async dashboard(userId: string, locale: string): Promise<Inspection> {
    const now = new Date();
    const { attempts, devices } = await this.visitors(userId, now);
    const backups = await this.backups.status();
    const watched = Boolean(this.config.get('BACKUP_DIR', { infer: true }));
    const facts: AppFacts = {
      account: {
        twoFactor: await this.twoFactor.isEnabled(userId),
        users: await this.users.count(),
        registrationOpen: this.config.get('ALLOW_REGISTRATION', { infer: true }),
      },
      ownAddresses: ownAddresses(attempts, devices, now),
      signIns: summarizeSignIns(attempts, devices, now),
      sessions: {
        total: devices.length,
        idleOverMonth: devices.filter(
          (device) => now.getTime() - device.lastUsedAt.getTime() > IDLE_SESSION_DAYS * DAY_MS,
        ).length,
      },
      site: await checkSite(this.config.get('PUBLIC_URL', { infer: true })),
      backups: {
        watched,
        latestAt: watched ? (backups?.latest?.createdAt ?? null) : null,
        problems: watched ? (backups?.problems ?? []) : [],
      },
      dependencies: await readAudit(),
    };
    return { facts, problems: appProblems(facts, securityMessages(locale)) };
  }

  /** The journal of sign-ins and the owner's signed-in devices: who comes to the dashboard. */
  private async visitors(
    userId: string,
    now: Date,
  ): Promise<{ attempts: SignInAttempt[]; devices: (SignedInDevice & { lastUsedAt: Date })[] }> {
    return {
      attempts: await this.signIns.since(new Date(now.getTime() - SIGN_IN_DAYS * DAY_MS)),
      devices: await this.db
        .select({
          ip: sessions.ip,
          userAgent: sessions.userAgent,
          createdAt: sessions.createdAt,
          lastUsedAt: sessions.lastUsedAt,
        })
        .from(sessions)
        .where(eq(sessions.userId, userId)),
    };
  }

  /** `null` — no report: the scan of the server is not set up (a local instance). */
  private async server(userId: string, locale: string): Promise<Inspection | null> {
    const folder = this.config.get('SECURITY_DIR', { infer: true });
    if (!folder) {
      return null;
    }
    const content = await readFile(join(folder, HOST_REPORT), 'utf8').catch(() => null);
    if (content === null) {
      return null;
    }
    const report = hostReportSchema.parse(JSON.parse(content));
    const now = new Date();
    const { attempts, devices } = await this.visitors(userId, now);
    const own: OwnAddress[] = ownAddresses(attempts, devices, now);
    // The owner deploys and administers from home: such a sign-in is theirs, and said so.
    const accepted = report.ssh.accepted.map((login) => ({
      ...login,
      own: own.some((address) => address.ip === login.ip),
    }));
    return {
      facts: { ...report, ssh: { ...report.ssh, accepted } },
      problems: hostProblems(report, securityMessages(locale), now),
    };
  }
}

async function readAudit(): Promise<AppFacts['dependencies']> {
  const path = join(__dirname, AUDIT_FILE);
  try {
    const audit = JSON.parse(await readFile(path, 'utf8')) as {
      metadata?: { vulnerabilities?: Record<string, number> };
    };
    const found = audit.metadata?.vulnerabilities;
    if (!found) {
      return null;
    }
    return {
      auditedAt: (await stat(path)).mtime.toISOString(),
      critical: found['critical'] ?? 0,
      high: found['high'] ?? 0,
      moderate: found['moderate'] ?? 0,
      low: found['low'] ?? 0,
    };
  } catch {
    return null; // Run from the sources: nothing was audited.
  }
}

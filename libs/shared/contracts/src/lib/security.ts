import { z } from 'zod';

/** How much a finding matters, the worst first. */
export const SECURITY_SEVERITIES = ['critical', 'high', 'medium', 'low', 'info'] as const;
export type SecuritySeverity = (typeof SECURITY_SEVERITIES)[number];

/**
 * What the security agent looks at: the dashboard itself (sign-ins, sessions, the site, backups,
 * dependencies), the server it runs on, the computers with the desktop app, the accounts and
 * repositories of the connected code hostings (GitHub, GitLab, Bitbucket).
 */
export const SECURITY_AREAS = ['app', 'host', 'desktop', 'repo'] as const;
export type SecurityArea = (typeof SECURITY_AREAS)[number];

/** `ignored` — the user knows and accepts it: it is not reported again. */
export const FINDING_STATUSES = ['open', 'ignored', 'resolved'] as const;
export type FindingStatus = (typeof FINDING_STATUSES)[number];

/** Who found it: a rule of the code, or the AI looking at the same facts. */
export const FINDING_ORIGINS = ['rules', 'ai'] as const;
export type FindingOrigin = (typeof FINDING_ORIGINS)[number];

export interface SecurityFinding {
  id: string;
  area: SecurityArea;
  severity: SecuritySeverity;
  title: string;
  /** What exactly was seen. */
  details: string;
  /** What to do about it, in a line or two; the agent itself fixes nothing. */
  fix: string;
  /** The AI's step-by-step guide for this very case (Markdown); `null` — not asked for yet. */
  guide: string | null;
  guideAt: string | null;
  origin: FindingOrigin;
  status: FindingStatus;
  firstSeenAt: string;
  lastSeenAt: string;
  resolvedAt: string | null;
}

/** The AI's account of an investigation. */
export interface SecurityReport {
  /** Markdown. */
  text: string;
  /** The model that wrote it. */
  model: string;
  createdAt: string;
}

export const securitySettingsSchema = z.object({
  /** The AI investigates once a day and on request; without it only the rules check. */
  aiEnabled: z.boolean(),
  /** The AI connection of the agent; `null` — the one the assistant uses. */
  connectionId: z.uuid().nullable(),
});
export type SecuritySettings = z.infer<typeof securitySettingsSchema>;

/** One area: whether there was anything to look at, and when it was last looked at. */
export interface SecurityAreaStatus {
  area: SecurityArea;
  /** `false` — not set up (no report of the server, no computer, no code hosting). */
  available: boolean;
}

export interface SecurityStatus {
  findings: SecurityFinding[];
  areas: SecurityAreaStatus[];
  report: SecurityReport | null;
  settings: SecuritySettings;
  /** When the rules last checked. */
  scannedAt: string | null;
  /** The agent has a model to ask (its own connection or the assistant's). */
  aiAvailable: boolean;
  /** The AI connections to choose the agent's own from. */
  connections: { id: string; name: string }[];
}

export const findingStatusSchema = z.object({ status: z.enum(['open', 'ignored']) });
export type FindingStatusChange = z.infer<typeof findingStatusSchema>;

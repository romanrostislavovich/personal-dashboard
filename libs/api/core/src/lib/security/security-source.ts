import { SecurityArea, SecuritySeverity } from '@pd/contracts';

/** A problem a source's rules see, in the user's language. */
export interface FoundProblem {
  /** Stable across scans: `host.firewall-off`, `desktop.<device>.defender-off`. */
  key: string;
  severity: SecuritySeverity;
  title: string;
  details: string;
  fix: string;
}

/** What a source knows right now. */
export interface Inspection {
  /** The raw facts: the AI reads them, so nothing secret (a token, a password hash) goes here. */
  facts: unknown;
  /** What the rules make of the facts. */
  problems: FoundProblem[];
}

/**
 * Something the security agent looks at. The core has its own sources (the dashboard, the
 * server); a module adds one in `<module>.security.ts`:
 *
 * ```ts
 * security.registerSource({
 *   id: 'computers',
 *   area: 'desktop',
 *   description: 'The computers with the desktop app: antivirus, firewall, updates…',
 *   inspect: (userId, locale) => this.inspect(userId, locale),
 * });
 * ```
 *
 * A source only reads. Its rules give the findings that need no AI; the AI gets the same facts
 * through a tool of its own (`security_<id>`) and may notice what the rules do not.
 */
export interface SecuritySource {
  /** Latin letters and `_`: the name of the AI tool is `security_<id>`. */
  id: string;
  area: SecurityArea;
  /** For the model: what the facts are and when they are worth a look. */
  description: string;
  /** `null` — nothing to look at: not set up (no report of the server, no computer). */
  inspect(userId: string, locale: string): Promise<Inspection | null>;
}

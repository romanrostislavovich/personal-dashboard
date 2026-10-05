import { SECURITY_SEVERITIES, SecurityFinding, SecuritySeverity } from '@pd/contracts';

/** The part of a stored finding that coverage is worked out from. */
export interface CoverageRow {
  id: string;
  key: string;
  origin: 'rules' | 'ai';
  status: 'open' | 'ignored' | 'resolved';
  severity: SecuritySeverity;
  title: string;
  /** Keys of the rules' findings an AI finding says it is about. */
  covers: string[];
}

export type Coverage = Pick<SecurityFinding, 'severity' | 'coveredBy' | 'covers'>;

const worse = (a: SecuritySeverity, b: SecuritySeverity): SecuritySeverity =>
  SECURITY_SEVERITIES.indexOf(a) <= SECURITY_SEVERITIES.indexOf(b) ? a : b;

/**
 * When the AI's finding is about the same problem as findings of the rules, the AI's one is
 * shown and the rules' ones fold under it: it says more (the facts side by side, a fix for the
 * whole of it) and one problem should be one card.
 *
 * Two things keep this from hiding anything. The AI's finding is never shown milder than the
 * worst finding it covers — a model cannot talk a "high" down to a "low". And the rules'
 * findings fold only while that AI finding stands (open, or ignored by the owner): once it is
 * gone, they are back on their own.
 */
export function coverage(rows: CoverageRow[]): Map<string, Coverage> {
  const result = new Map<string, Coverage>(
    rows.map((row) => [row.id, { severity: row.severity, coveredBy: null, covers: [] }]),
  );
  const standing = rows.filter((row) => row.status !== 'resolved');
  for (const ai of standing.filter((row) => row.origin === 'ai' && row.covers.length)) {
    const own = result.get(ai.id) as Coverage;
    for (const rule of standing.filter((row) => row.origin === 'rules')) {
      const covered = result.get(rule.id) as Coverage;
      // A finding of the rules folds under one AI finding: the first that named it.
      if (!ai.covers.includes(rule.key) || covered.coveredBy) {
        continue;
      }
      covered.coveredBy = ai.id;
      own.covers.push({ id: rule.id, title: rule.title, severity: rule.severity });
      own.severity = worse(own.severity, rule.severity);
    }
  }
  return result;
}

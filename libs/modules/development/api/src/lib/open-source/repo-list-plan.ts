import { RepoRelation } from '@pd/contracts';
import { AccountRepo } from './repo-source';

export interface SavedRepo {
  id: string;
  externalId: string | null;
  fullName: string;
  relation: RepoRelation;
}

export interface RepoListPlan<Row extends SavedRepo> {
  /** Saved rows the account still has, with their fresh data. */
  matched: { row: Row; repo: AccountRepo }[];
  /** Repositories of the account that are not saved yet. */
  added: AccountRepo[];
  /** Came from the account earlier and are gone from it: deleted, made private, left the organization. */
  removed: Row[];
  /** Added by hand and not part of the account: they are asked for by name. */
  manual: Row[];
}

/**
 * Compares the saved repositories with what the account has now. A repository is recognized by
 * the provider's id (so a rename keeps the row and its history), then by its name — that is how
 * one added by hand earlier becomes the account's own.
 */
export function planRepoList<Row extends SavedRepo>(
  rows: Row[],
  account: AccountRepo[],
): RepoListPlan<Row> {
  const byExternalId = new Map(
    rows.filter((row) => row.externalId).map((row) => [row.externalId, row]),
  );
  const byName = new Map(rows.map((row) => [row.fullName.toLowerCase(), row]));
  const taken = new Set<string>();
  const plan: RepoListPlan<Row> = { matched: [], added: [], removed: [], manual: [] };

  for (const repo of account) {
    const row = byExternalId.get(repo.externalId) ?? byName.get(repo.fullName.toLowerCase());
    if (row && !taken.has(row.id)) {
      taken.add(row.id);
      plan.matched.push({ row, repo });
    } else if (!row) {
      plan.added.push(repo);
    }
  }
  for (const row of rows.filter((saved) => !taken.has(saved.id))) {
    (row.relation === 'manual' ? plan.manual : plan.removed).push(row);
  }
  return plan;
}

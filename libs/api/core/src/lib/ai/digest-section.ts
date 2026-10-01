/**
 * A section of the morning digest. A module registers it in `onModuleInit`
 * (file `<module>.digest.ts`):
 *
 * ```ts
 * digest.register({
 *   id: 'development.repos',
 *   module: 'development',
 *   description: 'Open source repositories: stars, issues and PRs, latest release',
 *   collect: async (userId) => (await this.repos.list(userId)).map(({ fullName, stars }) => ({ fullName, stars })),
 * });
 * ```
 *
 * The digest is sent only with what changed since the previous one, so `collect` returns
 * facts that stay the same until something worth telling happens: stars and a release tag —
 * yes; "checked 3 minutes ago", response times or "days until" — no, they would make
 * the section new every morning.
 */
export interface DigestSection {
  /** Unique id prefixed with the module id; the last sent facts are stored under it. */
  id: string;
  module: string;
  /** For the model: what the facts are and what matters in them. */
  description: string;
  /** Facts for the digest; `null` — nothing to tell (not set up, empty). */
  collect: (userId: string) => Promise<unknown>;
  /** In every digest, changed or not (the weather). */
  always?: boolean;
}

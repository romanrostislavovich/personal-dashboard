import { npmPackageName } from '@pd/contracts';

/** npm package downloads for the last 7 days. `null` if the package is not found. */
export async function fetchNpmWeeklyDownloads(packageName: string): Promise<number | null> {
  // Scoped packages (@scope/name) are passed in the URL as is. Repositories added before links
  // were accepted may hold the package's npmjs.com page instead of its name.
  const name = npmPackageName(packageName);
  const response = await fetch(`https://api.npmjs.org/downloads/point/last-week/${name}`);
  if (response.status === 404) {
    return null;
  }
  if (!response.ok) {
    throw new Error(`npm API ${response.status} for ${name}`);
  }
  return ((await response.json()) as { downloads: number }).downloads;
}

/**
 * The GitHub repository a package says it is published from (`owner/name`, lower case);
 * `null` — the package is not on npm, names no repository or lives somewhere else.
 */
export async function fetchNpmPackageRepo(packageName: string): Promise<string | null> {
  // A scoped name keeps its `@` and has the slash encoded: `@scope%2Fname`.
  const name = packageName.replace('/', '%2F');
  const response = await fetch(`https://registry.npmjs.org/${name}/latest`);
  if (response.status === 404) {
    return null;
  }
  if (!response.ok) {
    throw new Error(`npm registry ${response.status} for ${packageName}`);
  }
  return githubRepoOf(((await response.json()) as { repository?: unknown }).repository);
}

/**
 * `owner/name` (lower case) from the `repository` field of a package, in any of the forms npm
 * accepts: `git+https://github.com/owner/name.git`, `git@github.com:owner/name.git`,
 * `github:owner/name`, the bare `owner/name`, a link into a monorepo folder — as a string or
 * as `{ url }`. `null` for another host or an unreadable value.
 */
export function githubRepoOf(repository: unknown): string | null {
  const value =
    typeof repository === 'string'
      ? repository
      : typeof (repository as { url?: unknown } | null)?.url === 'string'
        ? (repository as { url: string }).url
        : null;
  if (!value) {
    return null;
  }
  const match =
    value.match(/github\.com[/:]([\w.-]+)\/([\w.-]+)/i) ??
    value.match(/^(?:github:)?([\w.-]+)\/([\w.-]+)$/i);
  if (!match) {
    return null;
  }
  return `${match[1]}/${match[2].replace(/\.git$/i, '')}`.toLowerCase();
}

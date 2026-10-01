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

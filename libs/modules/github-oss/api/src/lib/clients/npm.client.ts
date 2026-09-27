/** npm package downloads for the last 7 days. `null` if the package is not found. */
export async function fetchNpmWeeklyDownloads(packageName: string): Promise<number | null> {
  // Scoped packages (@scope/name) are passed in the URL as is.
  const response = await fetch(`https://api.npmjs.org/downloads/point/last-week/${packageName}`);
  if (response.status === 404) {
    return null;
  }
  if (!response.ok) {
    throw new Error(`npm API ${response.status} for ${packageName}`);
  }
  return ((await response.json()) as { downloads: number }).downloads;
}

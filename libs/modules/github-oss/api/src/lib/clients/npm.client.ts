/** Загрузки npm-пакета за последние 7 дней. `null`, если пакет не найден. */
export async function fetchNpmWeeklyDownloads(packageName: string): Promise<number | null> {
  // Scoped-пакеты (@scope/name) передаются в URL как есть.
  const response = await fetch(`https://api.npmjs.org/downloads/point/last-week/${packageName}`);
  if (response.status === 404) {
    return null;
  }
  if (!response.ok) {
    throw new Error(`npm API ${response.status} for ${packageName}`);
  }
  return ((await response.json()) as { downloads: number }).downloads;
}

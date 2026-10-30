/** A copy older than this is made again. */
const DAY_MS = 24 * 3_600_000;

/** A copy is due when there is none, or the newest is a day old. */
export function copyDue(
  newest: {savedAt: string} | undefined,
  now: Date,
): boolean {
  return (
    !newest || now.getTime() - new Date(newest.savedAt).getTime() >= DAY_MS
  );
}

/** `personal-dashboard-2026-10-14.zip`, the day on the device's own clock: one copy a day. */
export function copyName(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  const day = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  return `personal-dashboard-${day}.zip`;
}

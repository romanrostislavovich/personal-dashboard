/** Bytes as people read them: "0 B", "740 KB", "12.4 MB", "3.1 GB", in the locale's digits. */
export function formatBytes(bytes: number, locale: string): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  const digits = unit === 0 || value >= 100 ? 0 : 1;
  return `${value.toLocaleString(locale, {maximumFractionDigits: digits})} ${units[unit]}`;
}

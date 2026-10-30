import {LifelogQuery} from '@pd/contracts';

export function isLifelogDay(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return (
    Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
  );
}

/** Inclusive calendar-month bounds, independent of timezone and DST (at most 31 days). */
export function lifelogMonthRange(month: string): LifelogQuery | undefined {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return undefined;
  const from = `${month}-01`;
  const end = new Date(`${from}T00:00:00Z`);
  end.setUTCMonth(end.getUTCMonth() + 1, 0);
  return {from, to: end.toISOString().slice(0, 10)};
}

export function lifelogMonthDays(month: string): string[] {
  const range = lifelogMonthRange(month);
  if (!range) return [];
  return Array.from(
    {length: Number(range.to.slice(-2))},
    (_, index) => `${month}-${String(index + 1).padStart(2, '0')}`,
  );
}

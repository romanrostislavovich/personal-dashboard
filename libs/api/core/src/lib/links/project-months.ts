import { LocalDate, ProjectFact, ProjectMonth } from '@pd/contracts';

/** The last `count` months up to the one of `today`, oldest first, each with its days. */
export function lastMonths(
  today: LocalDate,
  count: number,
): { month: string; from: LocalDate; to: LocalDate }[] {
  const [year, month] = today.split('-').map(Number);
  return Array.from({ length: count }, (_, index) => {
    // Month numbers from the year 0: stepping back a month is one less.
    const at = year * 12 + (month - 1) - (count - 1 - index);
    const key = `${Math.floor(at / 12)}-${String((at % 12) + 1).padStart(2, '0')}`;
    const lastDay = new Date(Date.UTC(Math.floor(at / 12), (at % 12) + 1, 0)).getUTCDate();
    return { month: key, from: `${key}-01`, to: `${key}-${String(lastDay).padStart(2, '0')}` };
  });
}

/** A month of a project out of what the sections told about it. */
export function monthOf(month: string, facts: ProjectFact[]): ProjectMonth {
  const sum = (metric: ProjectFact['metric']) =>
    facts.filter((fact) => fact.metric === metric).reduce((total, fact) => total + fact.value, 0);
  const money = facts.find((fact) => fact.metric === 'income' || fact.metric === 'expense');
  return {
    month,
    seconds: sum('seconds'),
    codingSeconds: sum('codingSeconds'),
    income: Math.round(sum('income') * 100) / 100,
    expense: Math.round(sum('expense') * 100) / 100,
    currency: money?.currency ?? null,
  };
}

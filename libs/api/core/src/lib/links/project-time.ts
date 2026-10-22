import { ProjectFact } from '@pd/contracts';

/**
 * The time at the computer on a project, never less than its IDE time on any day: coding is
 * done at a computer. The tracker sees the project only in windows titled after it — a
 * terminal, a browser or a computer without the tracker go unnoticed — while the IDE counts its
 * folder everywhere. Activity puts the IDE's stretches into its time where WakaTime gave them;
 * for the days it gave only totals the larger of the two is taken here, and what the IDE adds
 * is told (`fromCoding`). Without both times day by day the facts are left as they are.
 */
export function withCodingAtComputer(facts: ProjectFact[]): ProjectFact[] {
  const tracked = facts.find((fact) => fact.metric === 'seconds' && fact.days);
  const coding = facts.filter((fact) => fact.metric === 'codingSeconds' && fact.days);
  if (!tracked?.days || !coding.length) {
    return facts;
  }
  const byDay = new Map<string, number>();
  for (const fact of coding) {
    for (const { day, seconds } of fact.days ?? []) {
      byDay.set(day, (byDay.get(day) ?? 0) + seconds);
    }
  }
  const trackedOf = new Map(tracked.days.map(({ day, seconds }) => [day, seconds]));
  let added = 0;
  for (const [day, seconds] of byDay) {
    added += Math.max(0, seconds - (trackedOf.get(day) ?? 0));
  }
  if (added === 0) {
    return facts;
  }
  return facts.map((fact) =>
    fact === tracked
      ? { ...fact, value: fact.value + added, fromCoding: (fact.fromCoding ?? 0) + added }
      : fact,
  );
}

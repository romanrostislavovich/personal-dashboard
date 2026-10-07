import { ActivityOtherComputer, ActivityStats, LocalDate } from '@pd/contracts';

/** Time at a computer on a day, as another service knows it (see OtherComputersService). */
export interface OtherComputerTime {
  computer: string;
  source: string;
  day: LocalDate;
  seconds: number;
}

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * The computers other services know, each with whether its time is added to Activity. A
 * computer the desktop app runs on is not: the tracker has recorded all of its time already,
 * and adding the service's part of it would count that time twice. Neither is one the user
 * switched off.
 */
export function otherComputers(
  times: OtherComputerTime[],
  trackedNames: string[],
  skipped: string[],
): ActivityOtherComputer[] {
  const byComputer = new Map<string, ActivityOtherComputer>();
  for (const { computer, source, seconds } of times) {
    const key = `${source}:${computer.toLowerCase()}`;
    const known = byComputer.get(key);
    if (known) {
      known.seconds += seconds;
      continue;
    }
    const tracked = trackedNames.some((name) => same(name, computer));
    const off = skipped.some((name) => same(name, computer));
    byComputer.set(key, {
      computer,
      source,
      seconds,
      counted: !tracked && !off,
      reason: tracked ? 'tracked' : off ? 'off' : null,
    });
  }
  return [...byComputer.values()].sort((a, b) => b.seconds - a.seconds);
}

/**
 * Adds the time of the counted computers to the statistics of the tracker: to the total, to
 * its days and — what such a service counts being work in an IDE — to development.
 */
export function withOtherComputers(
  stats: ActivityStats,
  times: OtherComputerTime[],
  computers: ActivityOtherComputer[],
): ActivityStats {
  const counted = times.filter((time) =>
    computers.some(
      (item) => item.counted && item.source === time.source && same(item.computer, time.computer),
    ),
  );
  const added = counted.reduce((total, time) => total + time.seconds, 0);
  if (added === 0) {
    return { ...stats, otherComputers: [] };
  }
  const perDay = new Map<LocalDate, number>();
  for (const time of counted) {
    perDay.set(time.day, (perDay.get(time.day) ?? 0) + time.seconds);
  }
  const development = stats.categories.find((item) => item.category === 'development');
  const categories = development
    ? stats.categories.map((item) =>
        item === development ? { ...item, seconds: item.seconds + added } : item,
      )
    : [...stats.categories, { category: 'development' as const, seconds: added }];
  return {
    ...stats,
    totalSeconds: stats.totalSeconds + added,
    days: stats.days.map((day) => ({
      ...day,
      seconds: day.seconds + (perDay.get(day.day) ?? 0),
    })),
    categories: categories.sort((a, b) => b.seconds - a.seconds),
    otherComputers: computers
      .filter((item) => item.counted)
      .map(({ computer, source, seconds }) => ({ computer, source, seconds })),
  };
}

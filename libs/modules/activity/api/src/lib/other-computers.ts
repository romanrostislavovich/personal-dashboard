import { ActivityOtherComputer, ActivityStats, LocalDate } from '@pd/contracts';

/** Time at a computer on a day, as another service knows it (see OtherComputersService). */
export interface OtherComputerTime {
  computer: string;
  source: string;
  day: LocalDate;
  seconds: number;
  /** The one thing the service counts (Steam: games); otherwise it is work in an IDE. */
  category?: 'games';
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
 * What of the services' time is new to the tracker. Time in an IDE on a computer without the
 * tracker is all new. Time in games (Steam) is not tied to a computer and may have been played
 * on a tracked one, so on each day only what is over the tracker's own games time is new —
 * shared between the sources in proportion.
 */
export function newTime(
  counted: OtherComputerTime[],
  trackedGames: ReadonlyMap<LocalDate, number>,
): OtherComputerTime[] {
  const gamesOfDay = new Map<LocalDate, number>();
  for (const time of counted) {
    if (time.category === 'games') {
      gamesOfDay.set(time.day, (gamesOfDay.get(time.day) ?? 0) + time.seconds);
    }
  }
  return counted
    .map((time) => {
      if (time.category !== 'games') {
        return time;
      }
      const all = gamesOfDay.get(time.day) ?? 0;
      const over = Math.max(0, all - (trackedGames.get(time.day) ?? 0));
      return { ...time, seconds: all ? Math.round((time.seconds * over) / all) : 0 };
    })
    .filter((time) => time.seconds > 0);
}

/**
 * Adds the time of the counted computers to the statistics of the tracker: to the total, to
 * its days and to the category — games for a service of games, development for the rest (what
 * such a service counts being work in an IDE). `trackedGames` — the tracker's own games time
 * per day (see newTime).
 */
export function withOtherComputers(
  stats: ActivityStats,
  times: OtherComputerTime[],
  computers: ActivityOtherComputer[],
  trackedGames: ReadonlyMap<LocalDate, number> = new Map(),
): ActivityStats {
  const isCounted = (time: OtherComputerTime) =>
    computers.some(
      (item) => item.counted && item.source === time.source && same(item.computer, time.computer),
    );
  const counted = newTime(times.filter(isCounted), trackedGames);
  const added = counted.reduce((total, time) => total + time.seconds, 0);
  if (added === 0) {
    return { ...stats, otherComputers: [] };
  }
  const perDay = new Map<LocalDate, number>();
  const perCategory = new Map<'games' | 'development', number>();
  const perComputer = new Map<string, { computer: string; source: string; seconds: number }>();
  for (const time of counted) {
    perDay.set(time.day, (perDay.get(time.day) ?? 0) + time.seconds);
    const category = time.category ?? 'development';
    perCategory.set(category, (perCategory.get(category) ?? 0) + time.seconds);
    const key = `${time.source}:${time.computer.toLowerCase()}`;
    const computer = perComputer.get(key) ?? {
      computer: time.computer,
      source: time.source,
      seconds: 0,
    };
    computer.seconds += time.seconds;
    perComputer.set(key, computer);
  }
  const categories = stats.categories.map((item) => ({ ...item }));
  for (const [category, seconds] of perCategory) {
    const known = categories.find((item) => item.category === category);
    if (known) {
      known.seconds += seconds;
    } else {
      categories.push({ category, seconds });
    }
  }
  return {
    ...stats,
    totalSeconds: stats.totalSeconds + added,
    days: stats.days.map((day) => ({
      ...day,
      seconds: day.seconds + (perDay.get(day.day) ?? 0),
    })),
    categories: categories.sort((a, b) => b.seconds - a.seconds),
    otherComputers: [...perComputer.values()].sort((a, b) => b.seconds - a.seconds),
  };
}

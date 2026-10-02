import {
  ACTIVITY_CATEGORIES,
  ActivityCategory,
  ActivityStats,
  addDays,
  defaultActivityCategory,
  LocalDate,
  parseLocalDate,
  toLocalDate,
} from '@pd/contracts';

/** Time of one window title of one program on one day and device — what the stats are made of. */
export interface UsageRow {
  day: LocalDate;
  deviceId: string;
  app: string;
  appName: string;
  title: string;
  seconds: number;
}

/** A project with what its time is recognized by: its own name and the user's rules. */
export interface ProjectPatterns {
  projectId: string;
  name: string;
  patterns: string[];
}

const TOP_TITLES = 30;

/**
 * The project a window title belongs to: the first whose name or rule the title contains,
 * whatever the case. A longer pattern wins, so "dashboard-api" is not taken for "dashboard".
 */
export function matchProject(title: string, projects: ProjectPatterns[]): string | null {
  const lower = title.toLowerCase();
  let best: { projectId: string; length: number } | null = null;
  for (const project of projects) {
    for (const pattern of project.patterns) {
      const wanted = pattern.trim().toLowerCase();
      if (wanted.length >= 2 && lower.includes(wanted) && wanted.length > (best?.length ?? 0)) {
        best = { projectId: project.projectId, length: wanted.length };
      }
    }
  }
  return best?.projectId ?? null;
}

/** The category of a program: the user's own choice, or the default one. */
export function categoryOf(
  app: string,
  chosen: ReadonlyMap<string, ActivityCategory | null>,
): ActivityCategory {
  return chosen.get(app) ?? defaultActivityCategory(app);
}

/** Every day from `from` to `to`, both included. */
export function daysOf(from: LocalDate, to: LocalDate): LocalDate[] {
  const days: LocalDate[] = [];
  for (let day = from; day <= to; day = toLocalDate(addDays(parseLocalDate(day), 1))) {
    days.push(day);
    if (days.length > 400) {
      break; // A guard against a period typed by mistake.
    }
  }
  return days;
}

function addTo<K>(sums: Map<K, number>, key: K, seconds: number): void {
  sums.set(key, (sums.get(key) ?? 0) + seconds);
}

const descending = <T extends { seconds: number }>(a: T, b: T) => b.seconds - a.seconds;

/** The numbers of a period out of its usage rows. */
export function buildStats(
  rows: UsageRow[],
  period: { from: LocalDate; to: LocalDate },
  context: {
    categories: ReadonlyMap<string, ActivityCategory | null>;
    projects: ProjectPatterns[];
    devices: { id: string; name: string }[];
  },
): ActivityStats {
  const byDay = new Map<LocalDate, number>();
  const byApp = new Map<string, { name: string; seconds: number }>();
  const byCategory = new Map<ActivityCategory, number>();
  const byProject = new Map<string, number>();
  const byDevice = new Map<string, number>();
  const byTitle = new Map<string, { app: string; name: string; title: string; seconds: number }>();

  for (const row of rows) {
    addTo(byDay, row.day, row.seconds);
    addTo(byDevice, row.deviceId, row.seconds);
    addTo(byCategory, categoryOf(row.app, context.categories), row.seconds);
    const app = byApp.get(row.app) ?? { name: row.appName, seconds: 0 };
    app.seconds += row.seconds;
    byApp.set(row.app, app);
    const projectId = matchProject(row.title, context.projects);
    if (projectId) {
      addTo(byProject, projectId, row.seconds);
    }
    const key = `${row.app}\n${row.title}`;
    const title = byTitle.get(key) ?? {
      app: row.app,
      name: row.appName,
      title: row.title,
      seconds: 0,
    };
    title.seconds += row.seconds;
    byTitle.set(key, title);
  }

  return {
    totalSeconds: rows.reduce((sum, row) => sum + row.seconds, 0),
    days: daysOf(period.from, period.to).map((day) => ({ day, seconds: byDay.get(day) ?? 0 })),
    apps: [...byApp.entries()]
      .map(([app, { name, seconds }]) => ({
        app,
        name,
        category: categoryOf(app, context.categories),
        seconds,
      }))
      .sort(descending),
    categories: ACTIVITY_CATEGORIES.flatMap((category) => {
      const seconds = byCategory.get(category);
      return seconds ? [{ category, seconds }] : [];
    }).sort(descending),
    projects: context.projects
      .flatMap((project) => {
        const seconds = byProject.get(project.projectId);
        return seconds ? [{ projectId: project.projectId, name: project.name, seconds }] : [];
      })
      .sort(descending),
    devices: context.devices
      .map((device) => ({ ...device, seconds: byDevice.get(device.id) ?? 0 }))
      .sort(descending),
    titles: [...byTitle.values()].sort(descending).slice(0, TOP_TITLES),
  };
}

/** Time of one program on one day: what the records of all time are made of. */
export interface DayAppRow {
  day: LocalDate;
  app: string;
  seconds: number;
}

/** The numbers the achievements look at, over everything recorded. */
export interface ActivityRecords {
  totalSeconds: number;
  byCategory: Map<ActivityCategory, number>;
  /** Days with anything recorded. */
  activeDays: number;
  /** The most days in a row with anything recorded. */
  longestStreak: number;
  /** The longest day. */
  bestDaySeconds: number;
  /** The most time in development tools within one day. */
  bestDevelopmentDaySeconds: number;
  /** Different programs seen. */
  apps: number;
}

export function buildRecords(
  rows: DayAppRow[],
  categories: ReadonlyMap<string, ActivityCategory | null>,
): ActivityRecords {
  const byDay = new Map<LocalDate, number>();
  const developmentByDay = new Map<LocalDate, number>();
  const byCategory = new Map<ActivityCategory, number>();
  const apps = new Set<string>();
  for (const row of rows) {
    const category = categoryOf(row.app, categories);
    addTo(byDay, row.day, row.seconds);
    addTo(byCategory, category, row.seconds);
    if (category === 'development') {
      addTo(developmentByDay, row.day, row.seconds);
    }
    apps.add(row.app);
  }
  return {
    totalSeconds: rows.reduce((sum, row) => sum + row.seconds, 0),
    byCategory,
    activeDays: byDay.size,
    longestStreak: longestRun([...byDay.keys()]),
    bestDaySeconds: Math.max(0, ...byDay.values()),
    bestDevelopmentDaySeconds: Math.max(0, ...developmentByDay.values()),
    apps: apps.size,
  };
}

/** The most days in a row among the given ones. */
export function longestRun(days: LocalDate[]): number {
  let longest = 0;
  let run = 0;
  let previous: LocalDate | null = null;
  for (const day of [...new Set(days)].sort()) {
    const follows = previous && toLocalDate(addDays(parseLocalDate(previous), 1)) === day;
    run = follows ? run + 1 : 1;
    longest = Math.max(longest, run);
    previous = day;
  }
  return longest;
}

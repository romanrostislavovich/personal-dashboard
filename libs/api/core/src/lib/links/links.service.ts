import { Injectable, Logger } from '@nestjs/common';
import {
  DailyMetric,
  LocalDate,
  Moment,
  PersonNote,
  ProjectChange,
  ProjectFact,
  ServiceUsage,
} from '@pd/contracts';

/** A project as the sections are asked about it. */
export interface ProjectRef {
  id: string;
  name: string;
  url: string | null;
  /** Other names the project goes by: its repository, its folder in an IDE. */
  aliases: string[];
}

export interface Period {
  from: LocalDate;
  to: LocalDate;
}

/** What a section tells about a project (`<module>.links.ts`). */
export interface ProjectSource {
  module: string;
  facts?(userId: string, project: ProjectRef, period: Period): Promise<ProjectFact[]>;
  /** What changed in the project between two moments, newest first. */
  changes?(userId: string, project: ProjectRef, from: Date, to: Date): Promise<ProjectChange[]>;
}

/**
 * A section that knows whether something paid for is used: music knows the plays of a
 * streaming service, activity — the time in a program of that name.
 */
export interface UsageSource {
  module: string;
  /**
   * The use of a service by the name its payment has ("Spotify Premium"), lower case;
   * `null` — the section knows no such service (which is not the same as "not used").
   */
  usage(userId: string, name: string, period: Period): Promise<Omit<ServiceUsage, 'module'> | null>;
}

/** A page of the app the assistant may link to (`<module>.links.ts`). */
export interface AppPage {
  module: string;
  /** `/finance?tab=wishlist`; `<id>` marks a part to fill in. */
  path: string;
  /** In English, for the model: what the page shows. */
  description: string;
}

/** A section that has a number for every day (see DailyMetric). */
export interface DailyMetricSource {
  module: string;
  metrics(userId: string, period: Period): Promise<DailyMetric[]>;
}

/** A section that can tell what happened between two moments: the plays of music. */
export interface MomentSource {
  module: string;
  between(userId: string, from: Date, to: Date): Promise<Moment[]>;
}

/** A section that knows how long was worked on something called by a name. */
export interface TimeSpentSource {
  module: string;
  /**
   * How the time was counted: `focus` — focus sessions whose note names it; `windows` — windows
   * whose title names it. The two overlap, so they are told apart, never added.
   */
  kind: TimeSpentKind;
  /** Seconds for each of the names, lower case; a name nobody worked on is left out. */
  spent(userId: string, names: string[]): Promise<Map<string, number>>;
}
export type TimeSpentKind = 'focus' | 'windows';
export type TimeSpent = Record<TimeSpentKind, number>;

/** A section that keeps something about people by their names (gift ideas of the wishlist). */
export interface PeopleSource {
  module: string;
  /** What it keeps for each of the names, lower case; a name it knows nothing of is left out. */
  about(userId: string, names: string[]): Promise<Map<string, Omit<PersonNote, 'module'>[]>>;
}

/**
 * The links between the sections. A module never depends on another one, so what one knows and
 * another needs goes through here: the first registers a source in its `<module>.links.ts`, the
 * second asks the core. A source that fails is logged and left out — a link must never break
 * the section that asked.
 */
@Injectable()
export class LinksService {
  private readonly logger = new Logger(LinksService.name);
  private readonly projects: ProjectSource[] = [];
  private readonly usages: UsageSource[] = [];
  private readonly metrics: DailyMetricSource[] = [];
  private readonly moments: MomentSource[] = [];
  private readonly timeSpent: TimeSpentSource[] = [];
  private readonly appPages: AppPage[] = [];
  private readonly people: PeopleSource[] = [];

  registerProject(source: ProjectSource): void {
    this.projects.push(source);
  }

  registerUsage(source: UsageSource): void {
    this.usages.push(source);
  }

  registerDailyMetrics(source: DailyMetricSource): void {
    this.metrics.push(source);
  }

  registerMoments(source: MomentSource): void {
    this.moments.push(source);
  }

  registerTimeSpent(source: TimeSpentSource): void {
    this.timeSpent.push(source);
  }

  registerPeople(source: PeopleSource): void {
    this.people.push(source);
  }

  registerPages(pages: AppPage[]): void {
    this.appPages.push(...pages);
  }

  /** The pages of the app, for the assistant's links. */
  pages(): AppPage[] {
    return this.appPages;
  }

  async projectFacts(userId: string, project: ProjectRef, period: Period): Promise<ProjectFact[]> {
    return this.collect(this.projects, (source) => source.facts?.(userId, project, period));
  }

  /** What changed in a project between two moments, newest first. */
  async projectChanges(
    userId: string,
    project: ProjectRef,
    from: Date,
    to: Date,
  ): Promise<ProjectChange[]> {
    const changes = await this.collect(this.projects, (source) =>
      source.changes?.(userId, project, from, to),
    );
    return changes.sort((a, b) => b.at.localeCompare(a.at));
  }

  /** The use of a service a payment is named after; empty — no section knows such a service. */
  async usageOf(userId: string, name: string, period: Period): Promise<ServiceUsage[]> {
    const wanted = name.trim().toLowerCase();
    const found: ServiceUsage[] = [];
    for (const source of this.usages) {
      try {
        const usage = await source.usage(userId, wanted, period);
        if (usage) {
          found.push({ module: source.module, ...usage });
        }
      } catch (error) {
        this.logger.warn(`Usage of ${source.module} was not read: ${String(error)}`);
      }
    }
    return found;
  }

  async dailyMetrics(userId: string, period: Period): Promise<DailyMetric[]> {
    return this.collect(this.metrics, (source) => source.metrics(userId, period));
  }

  /**
   * One daily number by its key (`diary.mood`): only the section it belongs to is asked — the
   * key starts with the section's id. `null` — the section has no such number in the period.
   */
  async dailyMetric(userId: string, key: string, period: Period): Promise<DailyMetric | null> {
    const module = key.split('.')[0];
    const metrics = await this.collect(
      this.metrics.filter((source) => source.module === module),
      (source) => source.metrics(userId, period),
    );
    return metrics.find((metric) => metric.key === key) ?? null;
  }

  /** What the sections keep about the people of these names; the keys are lower case. */
  async aboutPeople(userId: string, names: string[]): Promise<Map<string, PersonNote[]>> {
    const notes = new Map<string, PersonNote[]>();
    const wanted = [...new Set(names.map((name) => name.trim().toLowerCase()).filter(Boolean))];
    if (!wanted.length) {
      return notes;
    }
    for (const source of this.people) {
      try {
        for (const [name, found] of await source.about(userId, wanted)) {
          notes.set(name, [
            ...(notes.get(name) ?? []),
            ...found.map((note) => ({ module: source.module, ...note })),
          ]);
        }
      } catch (error) {
        this.logger.warn(`People of ${source.module} were not read: ${String(error)}`);
      }
    }
    return notes;
  }

  /** What happened between two moments, oldest first. */
  async momentsBetween(userId: string, from: Date, to: Date): Promise<Moment[]> {
    const moments = await this.collect(this.moments, (source) => source.between(userId, from, to));
    return moments.sort((a, b) => a.at.localeCompare(b.at));
  }

  /** Seconds worked on each of the names (lower case), by how the time was counted. */
  async timeSpentOn(userId: string, names: string[]): Promise<Map<string, TimeSpent>> {
    const total = new Map<string, TimeSpent>();
    const wanted = [...new Set(names.map((name) => name.trim().toLowerCase()).filter(Boolean))];
    if (!wanted.length) {
      return total;
    }
    for (const source of this.timeSpent) {
      try {
        for (const [name, seconds] of await source.spent(userId, wanted)) {
          const spent = total.get(name) ?? { focus: 0, windows: 0 };
          spent[source.kind] += seconds;
          total.set(name, spent);
        }
      } catch (error) {
        this.logger.warn(`Time spent of ${source.module} was not read: ${String(error)}`);
      }
    }
    return total;
  }

  private async collect<S extends { module: string }, T>(
    sources: S[],
    ask: (source: S) => Promise<T[]> | undefined,
  ): Promise<T[]> {
    const all: T[] = [];
    for (const source of sources) {
      try {
        all.push(...((await ask(source)) ?? []));
      } catch (error) {
        this.logger.warn(`A link to ${source.module} failed: ${String(error).slice(0, 200)}`);
      }
    }
    return all;
  }
}

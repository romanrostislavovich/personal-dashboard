import { Injectable, Logger } from '@nestjs/common';
import {
  DailyMetric,
  LocalDate,
  Moment,
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

/** A section that knows how long was worked on something called by a name (focus sessions). */
export interface TimeSpentSource {
  module: string;
  /** Seconds for each of the names, lower case; a name nobody worked on is left out. */
  spent(userId: string, names: string[]): Promise<Map<string, number>>;
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

  /** What happened between two moments, oldest first. */
  async momentsBetween(userId: string, from: Date, to: Date): Promise<Moment[]> {
    const moments = await this.collect(this.moments, (source) => source.between(userId, from, to));
    return moments.sort((a, b) => a.at.localeCompare(b.at));
  }

  /** Seconds worked on each of the names (lower case), over every section that knows. */
  async timeSpentOn(userId: string, names: string[]): Promise<Map<string, number>> {
    const total = new Map<string, number>();
    const wanted = [...new Set(names.map((name) => name.trim().toLowerCase()).filter(Boolean))];
    if (!wanted.length) {
      return total;
    }
    for (const source of this.timeSpent) {
      try {
        for (const [name, seconds] of await source.spent(userId, wanted)) {
          total.set(name, (total.get(name) ?? 0) + seconds);
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

import { Injectable, Logger } from '@nestjs/common';
import {
  addDays,
  LifeCard,
  LifeDay,
  LifeEvent,
  LocalDate,
  parseLocalDate,
  toLocalDate,
  zonedToUtc,
} from '@pd/contracts';

/**
 * What a module tells about the user's life: the events of a day (a diary entry, the money
 * spent, the matches played) and the numbers of a period (a month, a year). Registered in the
 * module's `*.life.ts`.
 */
export interface LifeSource {
  module: string;
  day?(userId: string, day: LocalDate): Promise<LifeEvent[]>;
  period?(userId: string, period: { from: LocalDate; to: LocalDate }): Promise<LifeCard[]>;
}

/**
 * The life timeline and the summaries of a month or a year. Modules do not know about each
 * other, so each registers what it can tell here, and the core asks them all — like the search
 * and the morning digest.
 */
@Injectable()
export class LifeService {
  private readonly logger = new Logger(LifeService.name);
  private readonly sources: LifeSource[] = [];

  register(source: LifeSource): void {
    this.sources.push(source);
  }

  /** The events of a day across the modules; one module failing leaves the others. */
  async day(userId: string, day: LocalDate, hidden: string[] = []): Promise<LifeDay> {
    const events = (
      await Promise.all(
        this.visible(hidden).map((source) =>
          source.day ? this.safely(source.module, () => source.day?.(userId, day)) : [],
        ),
      )
    ).flat();
    // The day as a whole first, then by the time.
    events.sort((a, b) => (a.at ?? '').localeCompare(b.at ?? ''));
    return { day, events };
  }

  /** The numbers of a period across the modules, in the order the modules were registered. */
  async period(
    userId: string,
    period: { from: LocalDate; to: LocalDate },
    hidden: string[] = [],
  ): Promise<LifeCard[]> {
    return (
      await Promise.all(
        this.visible(hidden).map((source) =>
          source.period ? this.safely(source.module, () => source.period?.(userId, period)) : [],
        ),
      )
    ).flat();
  }

  private visible(hidden: string[]): LifeSource[] {
    return this.sources.filter((source) => !hidden.includes(source.module));
  }

  private async safely<T>(module: string, work: () => Promise<T[]> | undefined): Promise<T[]> {
    try {
      return (await work()) ?? [];
    } catch (error) {
      this.logger.warn(`Life of ${module} failed: ${(error as Error).message}`);
      return [];
    }
  }
}

/** The moments a period of the user's own days starts and ends (the end excluded). */
export function localDaysRange(
  timeZone: string,
  period: { from: LocalDate; to: LocalDate },
): { start: Date; end: Date } {
  const after = toLocalDate(addDays(parseLocalDate(period.to), 1));
  return {
    start: zonedToUtc({ date: period.from, time: '00:00' }, timeZone),
    end: zonedToUtc({ date: after, time: '00:00' }, timeZone),
  };
}

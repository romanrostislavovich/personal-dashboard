import { Injectable, Logger } from '@nestjs/common';
import { LocalDate } from '@pd/contracts';
import { ProjectRef } from '../links/links.service';

/** Time at a computer on a day, as a service other than the desktop app knows it. */
export interface OtherComputerDay {
  /** The computer as the service names it (a host name). */
  computer: string;
  day: LocalDate;
  seconds: number;
  /**
   * What the time was spent on, when the service counts one thing only (Steam: `games`).
   * Such time may be on a computer the tracker runs on as well, so only what is over the
   * tracker's own time in that category on the day is new (see Activity's other-computers.ts).
   */
  category?: 'games';
}

/** A stretch of time at a computer, as a service knows it to the second. */
export interface OtherComputerSpan {
  computer: string;
  startedAt: Date;
  endedAt: Date;
}

/** A stretch of time on a project, on whichever computer. */
export interface ProjectSpan {
  startedAt: Date;
  endedAt: Date;
}

/**
 * A service that knows about time at computers the desktop app may not run on — a work laptop
 * nothing can be installed on. A module registers one in `<module>.other-computers.ts`:
 *
 * ```ts
 * computers.register({
 *   id: 'wakatime',
 *   module: 'development',
 *   days: (userId, from, to) => this.machineDays(userId, from, to),
 * });
 * ```
 *
 * What such a service counts is usually less than the whole time at the computer (WakaTime:
 * only the time in an IDE): whoever shows it says so.
 */
export interface OtherComputerSource {
  /** `wakatime`: names the service where the time is shown. */
  id: string;
  module: string;
  days(userId: string, from: LocalDate, to: LocalDate): Promise<OtherComputerDay[]>;
  /**
   * The same time as stretches with their beginning and end, where the service knows them
   * (WakaTime: its durations, for the days copied since they are kept). With them the time is
   * put together with the tracker's and the browser's by the clock, not by the day: what
   * overlaps is counted once. A computer-day without them is counted by `days`.
   */
  spans?(userId: string, from: Date, to: Date): Promise<OtherComputerSpan[]>;
  /** When the service saw work on the project: what the time around it is judged by. */
  projectSpans?(userId: string, project: ProjectRef, from: Date, to: Date): Promise<ProjectSpan[]>;
}

/**
 * Joins the modules that know about time at a computer with the one that shows it (Activity),
 * without either knowing the other: modules never depend on each other.
 */
@Injectable()
export class OtherComputersService {
  private readonly logger = new Logger(OtherComputersService.name);
  private readonly sources: OtherComputerSource[] = [];

  register(source: OtherComputerSource): void {
    this.sources.push(source);
  }

  /** Every computer-day the sources know in the period; a source that fails is left out. */
  async days(
    userId: string,
    from: LocalDate,
    to: LocalDate,
  ): Promise<(OtherComputerDay & { source: string })[]> {
    const days: (OtherComputerDay & { source: string })[] = [];
    for (const source of this.sources) {
      try {
        const found = await source.days(userId, from, to);
        days.push(...found.map((day) => ({ ...day, source: source.id })));
      } catch (error) {
        this.logger.warn(`Computer time of ${source.id} was not read: ${String(error)}`);
      }
    }
    return days;
  }

  /** Every stretch at a computer the sources know between two moments (see `spans`). */
  async spans(
    userId: string,
    from: Date,
    to: Date,
  ): Promise<(OtherComputerSpan & { source: string })[]> {
    const spans: (OtherComputerSpan & { source: string })[] = [];
    for (const source of this.sources) {
      try {
        const found = (await source.spans?.(userId, from, to)) ?? [];
        spans.push(...found.map((span) => ({ ...span, source: source.id })));
      } catch (error) {
        this.logger.warn(`Computer spans of ${source.id} were not read: ${String(error)}`);
      }
    }
    return spans;
  }

  /** Every stretch of work on the project the sources know between two moments. */
  async projectSpans(
    userId: string,
    project: ProjectRef,
    from: Date,
    to: Date,
  ): Promise<ProjectSpan[]> {
    const spans: ProjectSpan[] = [];
    for (const source of this.sources) {
      try {
        spans.push(...((await source.projectSpans?.(userId, project, from, to)) ?? []));
      } catch (error) {
        this.logger.warn(`Project spans of ${source.id} were not read: ${String(error)}`);
      }
    }
    return spans;
  }
}

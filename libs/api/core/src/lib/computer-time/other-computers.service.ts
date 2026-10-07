import { Injectable, Logger } from '@nestjs/common';
import { LocalDate } from '@pd/contracts';

/** Time at a computer on a day, as a service other than the desktop app knows it. */
export interface OtherComputerDay {
  /** The computer as the service names it (a host name). */
  computer: string;
  day: LocalDate;
  seconds: number;
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
}

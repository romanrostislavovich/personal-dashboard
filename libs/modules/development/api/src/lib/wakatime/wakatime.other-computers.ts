import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { DB, Database, OtherComputersService } from '@pd/api-core';
import { and, eq, gte, lte } from 'drizzle-orm';
import { belongsTo, namesOf } from '../project-names';
import { WakatimeSpansService } from './wakatime-spans.service';
import { wakatimeDayBreakdown } from './wakatime.schema';

/**
 * WakaTime knows which computer the coding time came from — also a work laptop the desktop app
 * cannot be installed on. It is handed to the core, so Activity can count that computer too:
 * by the day, and by the clock for the days its stretches are copied. It also tells when a
 * project was being coded, on whichever computer. WakaTime counts only the time in an IDE,
 * never the whole time at the computer.
 */
@Injectable()
export class WakatimeOtherComputers implements OnModuleInit {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly computers: OtherComputersService,
    private readonly spans: WakatimeSpansService,
  ) {}

  onModuleInit(): void {
    this.computers.register({
      id: 'wakatime',
      module: 'development',
      days: (userId, from, to) =>
        this.db
          .select({
            computer: wakatimeDayBreakdown.name,
            day: wakatimeDayBreakdown.day,
            seconds: wakatimeDayBreakdown.seconds,
          })
          .from(wakatimeDayBreakdown)
          .where(
            and(
              eq(wakatimeDayBreakdown.userId, userId),
              eq(wakatimeDayBreakdown.kind, 'machine'),
              gte(wakatimeDayBreakdown.day, from),
              lte(wakatimeDayBreakdown.day, to),
            ),
          ),
      spans: async (userId, from, to) =>
        (await this.spans.between(userId, 'machine', from, to)).map(
          ({ name, startedAt, endedAt }) => ({ computer: name, startedAt, endedAt }),
        ),
      projectSpans: async (userId, project, from, to) => {
        const names = namesOf(project);
        const own = (await this.spans.names(userId, 'project', from, to)).filter((name) =>
          belongsTo(name, names),
        );
        return (await this.spans.between(userId, 'project', from, to, own)).map(
          ({ startedAt, endedAt }) => ({ startedAt, endedAt }),
        );
      },
    });
  }
}

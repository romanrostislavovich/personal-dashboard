import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { DB, Database, OtherComputersService } from '@pd/api-core';
import { and, eq, gte, lte } from 'drizzle-orm';
import { wakatimeDayBreakdown } from './wakatime.schema';

/**
 * WakaTime knows which computer the coding time came from — also a work laptop the desktop app
 * cannot be installed on. It is handed to the core, so Activity can count that computer too.
 * WakaTime counts only the time in an IDE, never the whole time at the computer.
 */
@Injectable()
export class WakatimeOtherComputers implements OnModuleInit {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly computers: OtherComputersService,
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
    });
  }
}

import { Injectable, OnModuleInit } from '@nestjs/common';
import { SchedulerService } from '@pd/api-core';
import { MoviesMatchService } from './movies-match.service';

/** The views of the last minutes get their titles: from the user's own, or from TMDB. */
@Injectable()
export class MoviesJob implements OnModuleInit {
  constructor(
    private readonly scheduler: SchedulerService,
    private readonly match: MoviesMatchService,
  ) {}

  onModuleInit(): void {
    this.scheduler.register({
      name: 'movies.match',
      cron: '*/2 * * * *',
      handler: () => this.match.resolvePending(),
    });
  }
}

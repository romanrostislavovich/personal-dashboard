import { Injectable, OnModuleInit } from '@nestjs/common';
import { SchedulerService, TelegramBotService } from '@pd/api-core';
import { MOVIE_ACTION, MovieQuestionService } from './movie-question.service';
import { MoviesMatchService } from './movies-match.service';

/**
 * The views of the last minutes get their titles: from the user's own, or from TMDB. And an hour
 * after a film is seen, "How was it?" goes out; the buttons under it answer.
 */
@Injectable()
export class MoviesJob implements OnModuleInit {
  constructor(
    private readonly scheduler: SchedulerService,
    private readonly telegram: TelegramBotService,
    private readonly match: MoviesMatchService,
    private readonly question: MovieQuestionService,
  ) {}

  onModuleInit(): void {
    this.scheduler.register({
      name: 'movies.match',
      cron: '*/2 * * * *',
      handler: () => this.match.resolvePending(),
    });
    this.scheduler.register({
      name: 'movies.question',
      cron: '*/5 * * * *',
      quiet: true,
      handler: () => this.question.askDue(),
    });
    this.telegram.registerAction({
      name: MOVIE_ACTION,
      handler: (user, payload) => this.question.answer(user, payload),
    });
  }
}

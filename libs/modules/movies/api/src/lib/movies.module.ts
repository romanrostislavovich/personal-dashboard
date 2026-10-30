import {Module} from '@nestjs/common';
import {MovieQuestionService} from './movie-question.service';
import {MoviesAchievements} from './movies.achievements';
import {MoviesMatchService} from './movies-match.service';
import {MoviesController} from './movies.controller';
import {MoviesIntegrations} from './movies.integrations';
import {MoviesJob} from './movies.job';
import {MoviesLinks} from './movies.links';
import {MoviesServerActions} from './movies.server-actions';
import {MoviesService} from './movies.service';

/**
 * Movies and TV shows: what was watched — sent by the browser extension from any site that
 * plays a video —, the ratings and notes, the list to watch; titles found in TMDB with the user's
 * own key. API: `/api/movies`.
 */
@Module({
  controllers: [MoviesController],
  providers: [
    MoviesService,
    MoviesMatchService,
    MovieQuestionService,
    MoviesServerActions,
    MoviesJob,
    MoviesLinks,
    MoviesIntegrations,
    MoviesAchievements,
  ],
})
export class MoviesModule {}

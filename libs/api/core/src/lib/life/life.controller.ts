import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import {
  BeforeAfter,
  BeforeAfterQuery,
  beforeAfterQuerySchema,
  Correlations,
  CorrelationsQuery,
  correlationsQuerySchema,
  ForecastTargets,
  forecastTargetsSchema,
  LifeDay,
  LifeDayQuery,
  lifeDayQuerySchema,
  LifeStoryQuery,
  lifeStoryQuerySchema,
  LifeSummary,
  LifeSummaryQuery,
  lifeSummaryQuerySchema,
  LinksChanges,
  LinksForecasts,
  LinksSeen,
  linksSeenSchema,
  MoodInsights,
  MoodInsightsQuery,
  moodInsightsQuerySchema,
  Unusual,
} from '@pd/contracts';
import {AiService} from '../ai/ai.service';
import {AuthUser, CurrentUser} from '../auth/current-user.decorator';
import {ProjectOverviewService} from '../links/project-overview.service';
import {ChangePointsService} from '../links/change-points.service';
import {ForecastsService} from '../links/forecasts.service';
import {ZodValidationPipe} from '../validation/zod-validation.pipe';
import {LifeStoriesService} from './life-stories.service';
import {LifeService} from './life.service';

/** The life timeline, the summaries and the AI's stories. */
@Controller('life')
export class LifeController {
  constructor(
    private readonly life: LifeService,
    private readonly stories: LifeStoriesService,
    private readonly ai: AiService,
    private readonly overviews: ProjectOverviewService,
    private readonly changes: ChangePointsService,
    private readonly forecasts: ForecastsService,
  ) {}

  /** What goes with the days of a good mood and of a bad one, across the sections. */
  @Get('mood-insights')
  moodInsights(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(moodInsightsQuerySchema))
    query: MoodInsightsQuery,
  ): Promise<MoodInsights> {
    return this.overviews.moodInsights(user.id, query);
  }

  /** Today's forecasts of the numbers (and tomorrow's in the evening), by the user's own models. */
  @Get('forecasts')
  forecastList(@CurrentUser() user: AuthUser): Promise<LinksForecasts> {
    return this.forecasts.list(user.id);
  }

  /** The numbers forecast beyond the default ones. */
  @Put('forecast-targets')
  @HttpCode(204)
  forecastTargets(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(forecastTargetsSchema)) body: ForecastTargets,
  ): Promise<void> {
    return this.forecasts.setTargets(user.id, body.targets);
  }

  /** How every daily number of the sections goes with every other, and what predicts one. */
  @Get('correlations')
  correlations(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(correlationsQuerySchema))
    query: CorrelationsQuery,
  ): Promise<Correlations> {
    return this.overviews.correlations(user.id, query);
  }

  /** Today's and yesterday's numbers far from their usual level. */
  @Get('unusual')
  unusual(@CurrentUser() user: AuthUser): Promise<Unusual> {
    return this.overviews.unusual(user.id);
  }

  /** The days the numbers' levels changed, over the whole history, the latest first. */
  @Get('changes')
  changePoints(@CurrentUser() user: AuthUser): Promise<LinksChanges> {
    return this.changes.list(user.id);
  }

  /** Something of Links opened: a change point or a pair's chart (for the achievements). */
  @Post('seen')
  @HttpCode(204)
  async seen(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(linksSeenSchema)) body: LinksSeen,
  ): Promise<void> {
    // A forecast is counted only when it is one the user is shown (a change is checked there).
    if (body.kind === 'forecast') {
      const [key, day] = body.key.split('|');
      if (!(await this.forecasts.isShown(user.id, key, day))) {
        return;
      }
    }
    return this.changes.seen(user.id, body);
  }

  /** Every daily number before and after the start or the end of a period of Health. */
  @Get('before-after')
  beforeAfter(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(beforeAfterQuerySchema))
    query: BeforeAfterQuery,
  ): Promise<BeforeAfter> {
    return this.overviews.beforeAfter(user.id, query);
  }

  @Get('day')
  day(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(lifeDayQuerySchema)) query: LifeDayQuery,
  ): Promise<LifeDay> {
    return this.life.day(user.id, query.day);
  }

  @Get('summary')
  async summary(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(lifeSummaryQuerySchema))
    query: LifeSummaryQuery,
  ): Promise<LifeSummary> {
    return {...query, cards: await this.life.period(user.id, query)};
  }

  // --- The AI's story of a month or a year ---

  @Get('story')
  async story(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(lifeStoryQuerySchema)) query: LifeStoryQuery,
  ) {
    return {story: await this.stories.get(user.id, query.period)};
  }

  @Post('story')
  async writeStory(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(lifeStoryQuerySchema)) body: LifeStoryQuery,
  ) {
    // Asked by hand: say that the AI is missing rather than "nothing to tell".
    if (!(await this.ai.isConfigured(user.id))) {
      throw new BadRequestException('AI is not configured');
    }
    return {story: await this.stories.write(user.id, body.period)};
  }
}

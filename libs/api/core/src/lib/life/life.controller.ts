import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  Query,
} from '@nestjs/common';
import {
  BeforeAfter,
  BeforeAfterQuery,
  beforeAfterQuerySchema,
  Correlations,
  CorrelationsQuery,
  correlationsQuerySchema,
  LifeDay,
  LifeDayQuery,
  lifeDayQuerySchema,
  LifeStoryQuery,
  lifeStoryQuerySchema,
  LifeSummary,
  LifeSummaryQuery,
  lifeSummaryQuerySchema,
  MoodForecast,
  MoodInsights,
  MoodInsightsQuery,
  moodInsightsQuerySchema,
} from '@pd/contracts';
import {AiService} from '../ai/ai.service';
import {AuthUser, CurrentUser} from '../auth/current-user.decorator';
import {ProjectOverviewService} from '../links/project-overview.service';
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

  /** Today's mood forecast from yesterday's numbers, by the user's own model. */
  @Get('forecast')
  forecast(@CurrentUser() user: AuthUser): Promise<MoodForecast> {
    return this.overviews.moodForecast(user.id);
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

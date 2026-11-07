import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
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
  LinksHourAfter,
  LinksInsights,
  LinksLapses,
  LinksOverload,
  LinksQuestion,
  LinksQuestions,
  LinksRhythm,
  LinksWindow,
  LinksSeen,
  linksSeenSchema,
  MoodInsights,
  MoodInsightsQuery,
  moodInsightsQuerySchema,
  OverloadSettings,
  overloadSettingsSchema,
  QuestionDraft,
  questionDraftSchema,
  QuestionInput,
  questionInputSchema,
  RhythmDays,
  RhythmQuery,
  rhythmQuerySchema,
  Unusual,
} from '@pd/contracts';
import {AiService} from '../ai/ai.service';
import {AuthUser, CurrentUser} from '../auth/current-user.decorator';
import {ProjectOverviewService} from '../links/project-overview.service';
import {ChangePointsService} from '../links/change-points.service';
import {ForecastsService} from '../links/forecasts.service';
import {HoursService} from '../links/hours/hours.service';
import {
  INSIGHTS_REFRESH,
  InsightsService,
} from '../links/questions/insights.service';
import {
  QUESTION_DRAFT,
  QuestionsService,
} from '../links/questions/questions.service';
import {LapseService} from '../links/overload/lapse.service';
import {OverloadService} from '../links/overload/overload.service';
import {ServerActions} from '../sync/server-actions';
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
    private readonly hours: HoursService,
    private readonly questions: QuestionsService,
    private readonly insights: InsightsService,
    private readonly actions: ServerActions,
    private readonly overload: OverloadService,
    private readonly lapse: LapseService,
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

  /** An hourly number by weekday and hour (the day's rhythm), and the numbers there are. */
  @Get('rhythm')
  rhythm(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(rhythmQuerySchema)) query: RhythmQuery,
  ): Promise<LinksRhythm> {
    return this.hours.rhythm(user.id, query.days as RhythmDays, query.key);
  }

  /** Every event against every hourly number in the hour after it. */
  @Get('hour-after')
  hourAfter(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(rhythmQuerySchema)) query: RhythmQuery,
  ): Promise<LinksHourAfter> {
    return this.hours.hourAfter(user.id, query.days as RhythmDays);
  }

  /** The question cards answered (built-in and the user's own), and what a new one may use. */
  @Get('questions')
  questionList(@CurrentUser() user: AuthUser): Promise<LinksQuestions> {
    return this.questions.list(user.id);
  }

  @Post('questions')
  addQuestion(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(questionInputSchema)) body: QuestionInput,
  ): Promise<LinksQuestion> {
    return this.questions.add(user.id, body);
  }

  /** A question in the user's words turned by the AI into a card to confirm (not kept). */
  @Post('questions/draft')
  draftQuestion(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(questionDraftSchema)) body: QuestionDraft,
  ): Promise<QuestionInput> {
    // The AI is reached by the server: a sync client asks it.
    return this.actions.run<QuestionInput>(user.id, QUESTION_DRAFT, {
      text: body.text,
    });
  }

  @Delete('questions/:id')
  @HttpCode(204)
  removeQuestion(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.questions.remove(user.id, id);
  }

  /** The latest week's findings, and which is today's. */
  @Get('insights')
  insightList(@CurrentUser() user: AuthUser): Promise<LinksInsights> {
    return this.insights.list(user.id);
  }

  /** Looks for this week's findings now (at most once an hour). */
  @Post('insights/refresh')
  async refreshInsights(@CurrentUser() user: AuthUser): Promise<LinksInsights> {
    // Made by the server only: a sync client asks it, and the result comes with the sync.
    await this.actions.run(user.id, INSIGHTS_REFRESH);
    return this.insights.list(user.id);
  }

  /** The overload score of the last days that are over, the user's own high, and its history. */
  @Get('overload')
  overloadStatus(@CurrentUser() user: AuthUser): Promise<LinksOverload> {
    return this.overload.status(user.id);
  }

  /** Whether the overload warning is sent. */
  @Put('overload-settings')
  @HttpCode(204)
  overloadSettings(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(overloadSettingsSchema)) body: OverloadSettings,
  ): Promise<void> {
    return this.overload.setEnabled(user.id, body.enabled);
  }

  /** Tomorrow's chance each habit lapses. */
  @Get('lapses')
  lapses(@CurrentUser() user: AuthUser): Promise<LinksLapses> {
    return this.lapse.lapses(user.id);
  }

  /** The productive window of every weekday, over the last 90 days. */
  @Get('window')
  window(@CurrentUser() user: AuthUser): Promise<LinksWindow> {
    return this.hours.window(user.id);
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
    if (
      body.kind === 'insight' &&
      !(await this.insights.owns(user.id, body.key))
    ) {
      return;
    }
    if (
      (body.kind === 'rhythm' || body.kind === 'after') &&
      !(await this.hours.knows(user.id, body.kind, body.key))
    ) {
      return;
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

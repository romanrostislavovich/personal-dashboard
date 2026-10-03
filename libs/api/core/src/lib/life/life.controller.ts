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
  LifeAnswer,
  LifeAsk,
  lifeAskSchema,
  LifeDay,
  LifeDayQuery,
  lifeDayQuerySchema,
  lifeGoalInputSchema,
  LifeGoalProgress,
  lifeGoalProgressSchema,
  LifeGoalsQuery,
  lifeGoalsQuerySchema,
  LifeStoryQuery,
  lifeStoryQuerySchema,
  LifeSummary,
  LifeSummaryQuery,
  lifeSummaryQuerySchema,
} from '@pd/contracts';
import { z } from 'zod';
import { AiService } from '../ai/ai.service';
import { AuthUser, CurrentUser } from '../auth/current-user.decorator';
import { ZodValidationPipe } from '../validation/zod-validation.pipe';
import { LifeGoalsService } from './life-goals.service';
import { LifeStoriesService } from './life-stories.service';
import { LifeService } from './life.service';

type ValidGoalInput = z.output<typeof lifeGoalInputSchema>;

/** How the answers about one's own life point to the days they are about. */
const ASK_RULES = [
  'The user is searching their own life history kept in the dashboard. Look for the answer',
  'with the tools: diary_search for words, places and people, then diary_entries, the',
  'transactions, music, activity and games tools for the rest. Answer in a few sentences with',
  'the dates. Link every day you mention as [3 Oct 2026](/life/day?day=2026-10-03) and a diary',
  'entry as [the entry](/diary?day=2026-10-03); use only links of this form. If nothing is',
  'found, say so plainly.',
];

/** The life timeline, the summaries, the goals of a year, the AI's stories and questions. */
@Controller('life')
export class LifeController {
  constructor(
    private readonly life: LifeService,
    private readonly goals: LifeGoalsService,
    private readonly stories: LifeStoriesService,
    private readonly ai: AiService,
  ) {}

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
    @Query(new ZodValidationPipe(lifeSummaryQuerySchema)) query: LifeSummaryQuery,
  ): Promise<LifeSummary> {
    return { ...query, cards: await this.life.period(user.id, query) };
  }

  // --- Goals of a year ---

  @Get('goals')
  listGoals(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(lifeGoalsQuerySchema)) query: LifeGoalsQuery,
  ) {
    return this.goals.list(user.id, query.year);
  }

  /** What a goal can be counted from. */
  @Get('metrics')
  metrics(@CurrentUser() user: AuthUser) {
    return this.goals.metrics(user.id);
  }

  @Post('goals')
  createGoal(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(lifeGoalInputSchema)) input: ValidGoalInput,
  ) {
    return this.goals.create(user.id, input);
  }

  @Put('goals/:id')
  updateGoal(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(lifeGoalInputSchema)) input: ValidGoalInput,
  ) {
    return this.goals.update(user.id, id, input);
  }

  /** The progress of a goal counted by hand. */
  @Put('goals/:id/progress')
  setProgress(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(lifeGoalProgressSchema)) body: LifeGoalProgress,
  ) {
    return this.goals.setProgress(user.id, id, body.value);
  }

  @Delete('goals/:id')
  @HttpCode(204)
  removeGoal(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.goals.remove(user.id, id);
  }

  // --- The AI's story of a month or a year ---

  @Get('story')
  async story(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(lifeStoryQuerySchema)) query: LifeStoryQuery,
  ) {
    return { story: await this.stories.get(user.id, query.period) };
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
    return { story: await this.stories.write(user.id, body.period) };
  }

  // --- A question about one's own life ---

  /** "When was I in Prague?": the AI searches with its tools and links the days it found. */
  @Post('ask')
  async ask(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(lifeAskSchema)) body: LifeAsk,
  ): Promise<LifeAnswer> {
    const { reply } = await this.ai.ask(user.id, [{ role: 'user', content: body.question }], {
      extraRules: ASK_RULES,
    });
    return { answer: reply };
  }
}

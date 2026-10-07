import {
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
  projectInputSchema,
  ProjectMonth,
  ProjectMonthsQuery,
  projectMonthsQuerySchema,
  ProjectOverview,
  ProjectOverviewQuery,
  projectOverviewQuerySchema,
} from '@pd/contracts';
import { z } from 'zod';
import { AuthUser, CurrentUser } from '../auth/current-user.decorator';
import { ZodValidationPipe } from '../validation/zod-validation.pipe';
import { ProjectOverviewService } from '../links/project-overview.service';
import { ProjectsService } from './projects.service';

type ProjectInput = z.output<typeof projectInputSchema>;

@Controller('projects')
export class ProjectsController {
  constructor(
    private readonly projects: ProjectsService,
    private readonly overviews: ProjectOverviewService,
  ) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.projects.list(user.id);
  }

  /** The project across the sections: its hours, money, tasks, sites and latest changes. */
  @Get(':id/overview')
  overview(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Query(new ZodValidationPipe(projectOverviewQuerySchema)) query: ProjectOverviewQuery,
  ): Promise<ProjectOverview> {
    return this.overviews.overview(user.id, id, query);
  }

  /** The project month by month: its hours and its money. */
  @Get(':id/months')
  months(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Query(new ZodValidationPipe(projectMonthsQuerySchema)) query: ProjectMonthsQuery,
  ): Promise<ProjectMonth[]> {
    return this.overviews.months(user.id, id, query.months);
  }

  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(projectInputSchema)) input: ProjectInput,
  ) {
    return this.projects.create(user.id, input);
  }

  @Put(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(projectInputSchema)) input: ProjectInput,
  ) {
    return this.projects.update(user.id, id, input);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.projects.remove(user.id, id);
  }
}

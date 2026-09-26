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
} from '@nestjs/common';
import { ProjectInput, projectInputSchema } from '@pd/contracts';
import { AuthUser, CurrentUser } from '../auth/current-user.decorator';
import { ZodValidationPipe } from '../validation/zod-validation.pipe';
import { ProjectsService } from './projects.service';

@Controller('projects')
export class ProjectsController {
  constructor(private readonly projects: ProjectsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.projects.list(user.id);
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

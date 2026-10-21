import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put, Query } from '@nestjs/common';
import {
  LifelogNote,
  LifelogQuery,
  lifelogDaySchema,
  lifelogNoteSchema,
  lifelogQuerySchema,
} from '@pd/contracts';
import { AuthUser, CurrentUser } from '../auth/current-user.decorator';
import { ZodValidationPipe } from '../validation/zod-validation.pipe';
import { LifelogService } from './lifelog.service';
import { LifelogSettings, lifelogSettingsSchema } from '@pd/contracts';
import { LifelogGenerator } from './lifelog-generator.service';

@Controller('life/narratives')
export class LifelogController {
  constructor(
    private readonly lifelog: LifelogService,
    private readonly generator: LifelogGenerator,
  ) {}

  @Get('settings')
  settings(@CurrentUser() user: AuthUser) {
    return this.lifelog.settings(user.id);
  }

  @Put('settings')
  configure(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(lifelogSettingsSchema)) input: LifelogSettings,
  ) {
    return this.lifelog.configure(user.id, input);
  }

  @Post(':day/generate')
  generate(
    @CurrentUser() user: AuthUser,
    @Param('day', new ZodValidationPipe(lifelogDaySchema)) day: string,
  ) {
    return this.generator.generate(user.id, day);
  }

  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(lifelogQuerySchema)) query: LifelogQuery,
  ) {
    return this.lifelog.list(user.id, query);
  }

  @Get(':day')
  get(
    @CurrentUser() user: AuthUser,
    @Param('day', new ZodValidationPipe(lifelogDaySchema)) day: string,
  ) {
    return this.lifelog.get(user.id, day);
  }

  @Put(':day/note')
  note(
    @CurrentUser() user: AuthUser,
    @Param('day', new ZodValidationPipe(lifelogDaySchema)) day: string,
    @Body(new ZodValidationPipe(lifelogNoteSchema)) body: LifelogNote,
  ) {
    return this.lifelog.saveNote(user.id, day, body.note);
  }

  @Delete(':day')
  @HttpCode(204)
  remove(
    @CurrentUser() user: AuthUser,
    @Param('day', new ZodValidationPipe(lifelogDaySchema)) day: string,
  ) {
    return this.lifelog.remove(user.id, day);
  }
}

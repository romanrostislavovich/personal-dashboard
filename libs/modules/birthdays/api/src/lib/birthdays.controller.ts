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
import { AuthUser, CurrentUser, ZodValidationPipe } from '@pd/api-core';
import { birthdayInputSchema } from '@pd/contracts';
import { BirthdaysService, ValidBirthdayInput } from './birthdays.service';

@Controller('birthdays')
export class BirthdaysController {
  constructor(private readonly birthdays: BirthdaysService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.birthdays.list(user.id);
  }

  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(birthdayInputSchema)) input: ValidBirthdayInput,
  ) {
    return this.birthdays.create(user.id, input);
  }

  @Put(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(birthdayInputSchema)) input: ValidBirthdayInput,
  ) {
    return this.birthdays.update(user.id, id, input);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.birthdays.remove(user.id, id);
  }
}

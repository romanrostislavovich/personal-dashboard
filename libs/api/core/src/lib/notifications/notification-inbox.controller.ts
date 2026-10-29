import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import {
  InboxAnswerInput,
  inboxAnswerSchema,
  InboxAnswerResult,
  InboxItem,
  InboxQueryParsed,
  inboxQuerySchema,
  InboxSummary,
  pushAnswerSchema,
  PushAnswerInput,
} from '@pd/contracts';
import { Public } from '../auth/public.decorator';
import { isPushAnswerToken } from './push/push.service';
import { AuthUser, CurrentUser } from '../auth/current-user.decorator';
import { ZodValidationPipe } from '../validation/zod-validation.pipe';
import { NotificationInboxService } from './notification-inbox.service';

/** The bell (see NotificationInboxService): the same on the web, the desktop and the phone. */
@Controller('notifications/inbox')
export class NotificationInboxController {
  constructor(private readonly inbox: NotificationInboxService) {}

  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(inboxQuerySchema)) query: InboxQueryParsed,
  ): Promise<InboxItem[]> {
    return this.inbox.list(user.id, query);
  }

  /** The bell's numbers: unread, and questions waiting for an answer. */
  @Get('summary')
  summary(@CurrentUser() user: AuthUser): Promise<InboxSummary> {
    return this.inbox.summary(user.id);
  }

  @Post('read')
  @HttpCode(204)
  readAll(@CurrentUser() user: AuthUser): Promise<void> {
    return this.inbox.markRead(user.id);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string): Promise<InboxItem> {
    return this.inbox.get(user.id, id);
  }

  @Post(':id/read')
  @HttpCode(204)
  read(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.inbox.markRead(user.id, id);
  }

  /**
   * A button pressed in the phone's shade (`PushActionReceiver`): no session there — the token the
   * notification carried fits it alone.
   */
  @Public()
  @Post(':id/push-answer')
  answerFromPush(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(pushAnswerSchema)) input: PushAnswerInput,
  ): Promise<InboxAnswerResult> {
    if (!isPushAnswerToken(id, input.token)) {
      throw new ForbiddenException();
    }
    return this.inbox.answerFromPush(id, input.action);
  }

  /** A button pressed, or the words it asked for. */
  @Post(':id/answer')
  answer(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(inboxAnswerSchema)) input: InboxAnswerInput,
  ): Promise<InboxAnswerResult> {
    return this.inbox.answer(user.id, id, input, 'web');
  }
}

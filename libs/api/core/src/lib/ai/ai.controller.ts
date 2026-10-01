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
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  AI_ATTACHMENT_MAX_BYTES,
  AiAction,
  AiAttachmentUpload,
  AiChatRequest,
  aiChatRequestSchema,
  AiChatResponse,
  AiConnectionInput,
  aiConnectionInputSchema,
  AiConversation,
  AiConversationDetail,
  AiPreferences,
  aiPreferencesSchema,
  AiSettings,
} from '@pd/contracts';
import { AuthUser, CurrentUser } from '../auth/current-user.decorator';
import { ZodValidationPipe } from '../validation/zod-validation.pipe';
import { AiConnectionsService } from './ai-connections.service';
import { AiActionsService } from './ai-actions.service';
import { AiConversationsService } from './ai-conversations.service';
import { AiService } from './ai.service';
import { AttachmentError, attachmentText } from './attachment-text';
import { MorningDigestService } from './morning-digest.service';

/** The part of a multer upload we use (multer's own types are not installed). */
interface UploadedDocument {
  buffer: Buffer;
  originalname: string;
}

@Controller('ai')
export class AiController {
  constructor(
    private readonly ai: AiService,
    private readonly aiActions: AiActionsService,
    private readonly connections: AiConnectionsService,
    private readonly conversations: AiConversationsService,
    private readonly digest: MorningDigestService,
  ) {}

  @Get('settings')
  settings(@CurrentUser() user: AuthUser): Promise<AiSettings> {
    return this.connections.settings(user.id);
  }

  /** What the assistant changed or tried to change, newest first. */
  @Get('actions')
  actions(@CurrentUser() user: AuthUser): Promise<AiAction[]> {
    return this.aiActions.list(user.id);
  }

  /** Modules that give the AI data — the switches of "what the AI sees". */
  @Get('modules')
  modules(): string[] {
    return this.ai.modules();
  }

  /** Optional sections of the morning digest — the switches under it in the settings. */
  @Get('digest-options')
  digestOptions(): string[] {
    return this.digest.optIns();
  }

  @Put('preferences')
  savePreferences(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(aiPreferencesSchema)) preferences: AiPreferences,
  ): Promise<AiSettings> {
    return this.connections.savePreferences(user.id, preferences);
  }

  // --- Connections: several providers, one active ---

  @Post('connections')
  createConnection(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(aiConnectionInputSchema)) input: AiConnectionInput,
  ): Promise<AiSettings> {
    return this.connections.create(user.id, input);
  }

  @Put('connections/:id')
  updateConnection(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(aiConnectionInputSchema)) input: AiConnectionInput,
  ): Promise<AiSettings> {
    return this.connections.update(user.id, id, input);
  }

  @Delete('connections/:id')
  removeConnection(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<AiSettings> {
    return this.connections.remove(user.id, id);
  }

  @Post('connections/:id/activate')
  @HttpCode(200)
  activateConnection(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<AiSettings> {
    return this.connections.activate(user.id, id);
  }

  /**
   * Chat: one new message; the conversation is stored and shared with Telegram.
   * Like the Telegram assistant, it can also change data when asked.
   */
  @Post('chat')
  chat(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(aiChatRequestSchema)) request: AiChatRequest,
  ): Promise<AiChatResponse> {
    return this.conversations.ask(user.id, request, { allowWrites: true });
  }

  // --- Conversations: the current one is the one updated last ---

  @Get('conversations')
  conversationList(@CurrentUser() user: AuthUser): Promise<AiConversation[]> {
    return this.conversations.list(user.id);
  }

  @Get('conversations/current')
  currentConversation(@CurrentUser() user: AuthUser): Promise<AiConversationDetail | null> {
    return this.conversations.current(user.id);
  }

  @Get('conversations/:id')
  conversation(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<AiConversationDetail> {
    return this.conversations.get(user.id, id);
  }

  /** "New conversation": the next message, here or in Telegram, starts from scratch. */
  @Post('conversations')
  startConversation(@CurrentUser() user: AuthUser): Promise<AiConversationDetail> {
    return this.conversations.start(user.id);
  }

  @Delete('conversations/:id')
  @HttpCode(204)
  removeConversation(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.conversations.remove(user.id, id);
  }

  /** The text of a file for the chat: the client sends it back with the next message. */
  @Post('attachments')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: AI_ATTACHMENT_MAX_BYTES },
      // Browsers send file names in UTF-8 ("Выписка.pdf"); the default would be Latin-1.
      defParamCharset: 'utf8',
    }),
  )
  async attachment(
    @UploadedFile() file: UploadedDocument | undefined,
  ): Promise<AiAttachmentUpload> {
    if (!file) {
      throw new BadRequestException('Expected a file in the "file" field');
    }
    try {
      return await attachmentText({ name: file.originalname, data: file.buffer });
    } catch (error) {
      if (error instanceof AttachmentError) {
        throw new BadRequestException({ message: error.message, reason: error.reason });
      }
      throw new BadRequestException('Could not read the file');
    }
  }
}

import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpException,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Put,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  AI_ATTACHMENT_MAX_BYTES,
  AiAction,
  AiAttachmentUpload,
  AiMemory,
  AiRecallHit,
  AiMemoryInput,
  aiMemoryInputSchema,
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
import { AiMemoryService } from './ai-memory.service';
import { RecallService } from '../recall/recall.service';
import { AttachmentError, attachmentText } from './attachment-text';
import { MorningDigestService } from './morning-digest.service';
import { RateLimit } from '../system/rate-limit';

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
    private readonly memories: AiMemoryService,
    private readonly recall_: RecallService,
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

  /** Search by meaning over the user's history; 400 — no connection makes vectors. */
  @RateLimit(120, 3600)
  @Get('recall')
  async recall(
    @CurrentUser() user: AuthUser,
    @Query('q') question: string | undefined,
    @Query('module') module: string | undefined,
  ): Promise<AiRecallHit[]> {
    const text = (question ?? '').trim().slice(0, 500);
    if (!text) {
      throw new BadRequestException('Expected a question in `q`');
    }
    const hits = await this.recall_.search(user.id, text, { module });
    if (!hits) {
      throw new BadRequestException('No AI connection makes vectors: see Settings → AI');
    }
    return hits;
  }

  /** How many items the index of search by meaning holds; it is rebuilt with `POST`. */
  @Get('recall/status')
  async recallStatus(@CurrentUser() user: AuthUser): Promise<{ indexed: number }> {
    return { indexed: await this.recall_.indexed(user.id) };
  }

  @RateLimit(10, 3600)
  @Post('recall/index')
  async recallIndex(@CurrentUser() user: AuthUser): Promise<{ indexed: number }> {
    if ((await this.recall_.index(user.id)) === null) {
      throw new BadRequestException('No AI connection makes vectors: see Settings → AI');
    }
    return { indexed: await this.recall_.indexed(user.id) };
  }

  /** What the assistant keeps between conversations. */
  @Get('memories')
  listMemories(@CurrentUser() user: AuthUser): Promise<AiMemory[]> {
    return this.memories.list(user.id);
  }

  @Post('memories')
  addMemory(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(aiMemoryInputSchema)) input: AiMemoryInput,
  ): Promise<AiMemory> {
    return this.memories.add(user.id, input.text);
  }

  @Delete('memories/:id')
  @HttpCode(204)
  removeMemory(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.memories.remove(user.id, id);
  }

  /** Puts back what one change of the assistant did. */
  @Post('actions/:id/undo')
  @HttpCode(204)
  async undoAction(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.ai.undoAction(user.id, id);
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
  // Every message is a paid request to the AI.
  @RateLimit(30, 60)
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

  /**
   * The text of a file for the chat: the client sends it back with the next message. A picture
   * is written down by the connection that reads pictures.
   */
  @RateLimit(30, 3600)
  @Post('attachments')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: AI_ATTACHMENT_MAX_BYTES },
      // Browsers send file names in UTF-8 ("Выписка.pdf"); the default would be Latin-1.
      defParamCharset: 'utf8',
    }),
  )
  async attachment(
    @CurrentUser() user: AuthUser,
    @UploadedFile() file: UploadedDocument | undefined,
  ): Promise<AiAttachmentUpload> {
    if (!file) {
      throw new BadRequestException('Expected a file in the "file" field');
    }
    try {
      return await attachmentText(
        { name: file.originalname, data: file.buffer },
        (instruction, image) =>
          this.ai.completeWithImage(user.id, instruction, image, undefined, { keepLanguage: true }),
      );
    } catch (error) {
      if (error instanceof AttachmentError) {
        throw new BadRequestException({ message: error.message, reason: error.reason });
      }
      // The model that reads pictures failed or hit its limit: the user sees why.
      if (error instanceof HttpException) {
        throw error;
      }
      throw new BadRequestException('Could not read the file');
    }
  }
}

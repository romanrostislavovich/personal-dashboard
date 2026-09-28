import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Post,
  Put,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  AI_ATTACHMENT_MAX_BYTES,
  AiAttachmentUpload,
  AiChatRequest,
  aiChatRequestSchema,
  AiChatResponse,
  AiSettings,
  AiSettingsInput,
  aiSettingsInputSchema,
} from '@pd/contracts';
import { AuthUser, CurrentUser } from '../auth/current-user.decorator';
import { ZodValidationPipe } from '../validation/zod-validation.pipe';
import { AiService } from './ai.service';
import { AttachmentError, attachmentText } from './attachment-text';

/** The part of a multer upload we use (multer's own types are not installed). */
interface UploadedDocument {
  buffer: Buffer;
  originalname: string;
}

@Controller('ai')
export class AiController {
  constructor(private readonly ai: AiService) {}

  @Get('settings')
  settings(@CurrentUser() user: AuthUser): Promise<AiSettings> {
    return this.ai.getSettings(user.id);
  }

  @Put('settings')
  saveSettings(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(aiSettingsInputSchema)) input: AiSettingsInput,
  ): Promise<AiSettings> {
    return this.ai.saveSettings(user.id, input);
  }

  @Delete('settings')
  @HttpCode(204)
  removeSettings(@CurrentUser() user: AuthUser) {
    return this.ai.removeSettings(user.id);
  }

  /**
   * Chat: the client sends the whole history, the server stores nothing.
   * Like the Telegram assistant, it can also add data when asked.
   */
  @Post('chat')
  chat(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(aiChatRequestSchema)) request: AiChatRequest,
  ): Promise<AiChatResponse> {
    return this.ai.ask(user.id, request.messages, { allowWrites: true });
  }

  /**
   * The text of a file for the chat. Nothing is stored: the client sends the text back with
   * the message, like the rest of the history.
   */
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

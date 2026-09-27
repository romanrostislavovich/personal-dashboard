import { Body, Controller, Delete, Get, HttpCode, Post, Put } from '@nestjs/common';
import {
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

  /** Chat: the client sends the whole history, the server stores nothing. */
  @Post('chat')
  chat(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(aiChatRequestSchema)) request: AiChatRequest,
  ): Promise<AiChatResponse> {
    return this.ai.ask(user.id, request.messages);
  }
}

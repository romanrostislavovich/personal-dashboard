import { HttpException, Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppConfig, TelegramBotService, UserRow, UsersService } from '@pd/api-core';
import { zonedDateTime } from '@pd/contracts';
import { healthMessages } from '../health.messages';
import { HealthService } from '../health.service';
import { DocumentReaderService, ReadFailure } from './document-reader.service';

/**
 * A photo of a medical document sent to Telegram ("🩺 A medical document" under it): it is kept
 * in Health and read by the AI into a draft; the reply links to the page where the draft is
 * checked and saved. Nothing but the document is recorded from the chat.
 */
@Injectable()
export class HealthTelegram implements OnModuleInit {
  private readonly publicUrl: string;

  constructor(
    @Inject(ConfigService) config: AppConfig,
    private readonly telegram: TelegramBotService,
    private readonly health: HealthService,
    private readonly reader: DocumentReaderService,
    private readonly users: UsersService,
  ) {
    this.publicUrl = config.get('PUBLIC_URL', { infer: true }).replace(/\/+$/, '');
  }

  onModuleInit(): void {
    this.telegram.registerPhotoHandler(
      async (user, photo) => this.fromPhoto(user, await photo.download(), photo.mimeType),
      {
        id: 'med',
        label: { en: healthMessages('en').photoChoice, ru: healthMessages('ru').photoChoice },
      },
    );
  }

  async fromPhoto(user: UserRow, data: Buffer, mimeType: string): Promise<string> {
    const text = healthMessages(user.locale);
    const today = zonedDateTime(new Date(), this.users.timeZoneOf(user)).date;
    const document = await this.health.addDocument(
      user.id,
      { name: `Telegram ${today}`, kind: 'other', documentedOn: today },
      { data, mimeType },
    );
    try {
      const draft = await this.reader.read(user.id, document.id);
      return text.read(draft.kind, `${this.publicUrl}/health/history?draft=${document.id}`);
    } catch (error) {
      const code = error instanceof HttpException ? codeOf(error) : null;
      return text.failed[code ?? 'aiFailed'];
    }
  }
}

function codeOf(error: HttpException): ReadFailure | null {
  const code = (error.getResponse() as { code?: unknown }).code;
  return typeof code === 'string' ? (code as ReadFailure) : null;
}

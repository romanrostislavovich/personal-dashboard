import {HttpException, Inject, Injectable, OnModuleInit} from '@nestjs/common';
import {ConfigService} from '@nestjs/config';
import {
  AppConfig,
  TelegramBotService,
  UserRow,
  UsersService,
} from '@pd/api-core';
import {HEALTH_DOCUMENT_MAX_PAGES, zonedDateTime} from '@pd/contracts';
import {healthMessages} from '../health.messages';
import {HealthService} from '../health.service';
import {DocumentReaderService, ReadFailure} from './document-reader.service';

/**
 * A photo of a medical document sent to Telegram ("🩺 A medical document" under it): it is kept
 * in Health and read by the AI into a draft; the reply links to the page where the draft is
 * checked and saved. An album is one document, a photo a page. Nothing but the document is
 * recorded from the chat.
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
    this.publicUrl = config
      .get('PUBLIC_URL', {infer: true})
      .replace(/\/+$/, '');
  }

  onModuleInit(): void {
    this.telegram.registerPhotoHandler(
      async (user, photo) =>
        this.fromPhotos(
          user,
          await Promise.all(
            photo.pages.map(async page => ({
              data: await page.download(),
              mimeType: page.mimeType,
            })),
          ),
        ),
      {
        id: 'med',
        label: {
          en: healthMessages('en').photoChoice,
          ru: healthMessages('ru').photoChoice,
        },
        wholeAlbum: true,
      },
    );
  }

  /** The pages of one document, in order; the first one makes it. */
  async fromPhotos(
    user: UserRow,
    pages: {data: Buffer; mimeType: string}[],
  ): Promise<string> {
    const text = healthMessages(user.locale);
    const today = zonedDateTime(new Date(), this.users.timeZoneOf(user)).date;
    const [first, ...rest] = pages.slice(0, HEALTH_DOCUMENT_MAX_PAGES);
    const document = await this.health.addDocument(
      user.id,
      {name: `Telegram ${today}`, kind: 'other', documentedOn: today},
      first,
    );
    for (const page of rest) {
      await this.health.addPage(user.id, document.id, page);
    }
    try {
      const draft = await this.reader.read(user.id, document.id);
      return text.read(
        draft.kind,
        `${this.publicUrl}/health/history?draft=${document.id}`,
      );
    } catch (error) {
      const code = error instanceof HttpException ? codeOf(error) : null;
      return text.failed[code ?? 'aiFailed'];
    }
  }
}

function codeOf(error: HttpException): ReadFailure | null {
  const code = (error.getResponse() as {code?: unknown}).code;
  return typeof code === 'string' ? (code as ReadFailure) : null;
}

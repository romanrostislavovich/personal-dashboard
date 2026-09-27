import {
  BadRequestException,
  Controller,
  Get,
  Header,
  Headers,
  HttpCode,
  Inject,
  NotFoundException,
  Post,
  Req,
  StreamableFile,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SyncStatus, syncPullRequestSchema, syncPushRequestSchema } from '@pd/contracts';
import { IncomingMessage } from 'node:http';
import { z } from 'zod';
import { Public } from '../auth/public.decorator';
import { AppConfig } from '../config/env';
import {
  decodeSyncBody,
  encodeSyncBody,
  isValidSyncToken,
  readRequestBody,
  SYNC_CONTENT_TYPE,
} from './sync-protocol';
import { SyncClient } from './sync-client.service';
import { SyncService } from './sync.service';

/**
 * `push` and `pull` are called by the client instance (SYNC_TOKEN instead of a user login:
 * sync covers the whole database). `status` and `run` are for the settings page.
 */
@Controller('sync')
export class SyncController {
  constructor(
    @Inject(ConfigService) private readonly config: AppConfig,
    private readonly sync: SyncService,
    private readonly client: SyncClient,
  ) {}

  @Public()
  @Post('push')
  @HttpCode(200)
  @Header('Content-Type', SYNC_CONTENT_TYPE)
  async push(@Req() request: IncomingMessage, @Headers('authorization') auth?: string) {
    const body = await this.readBody(request, auth, syncPushRequestSchema);
    return new StreamableFile(await encodeSyncBody(await this.sync.receive(body)));
  }

  @Public()
  @Post('pull')
  @HttpCode(200)
  @Header('Content-Type', SYNC_CONTENT_TYPE)
  async pull(@Req() request: IncomingMessage, @Headers('authorization') auth?: string) {
    const body = await this.readBody(request, auth, syncPullRequestSchema);
    return new StreamableFile(await encodeSyncBody(await this.sync.send(body)));
  }

  @Get('status')
  status(): Promise<SyncStatus> {
    return this.sync.status();
  }

  /** "Sync now" on the client. */
  @Post('run')
  async run(): Promise<SyncStatus> {
    if (this.sync.mode !== 'client') {
      throw new BadRequestException('This instance is not a sync client');
    }
    await this.client.syncNow();
    return this.sync.status();
  }

  private async readBody<T>(
    request: IncomingMessage,
    auth: string | undefined,
    schema: z.ZodType<T>,
  ): Promise<T> {
    const token = this.config.get('SYNC_TOKEN', { infer: true });
    if (this.sync.mode !== 'server' || !token) {
      throw new NotFoundException();
    }
    if (!isValidSyncToken(auth, token)) {
      throw new UnauthorizedException();
    }
    if (request.headers['content-type'] !== SYNC_CONTENT_TYPE) {
      throw new BadRequestException(`Expected ${SYNC_CONTENT_TYPE}`);
    }
    let body: unknown;
    try {
      body = await decodeSyncBody(await readRequestBody(request));
    } catch (error) {
      throw new BadRequestException(`Unreadable sync request: ${error}`);
    }
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(z.prettifyError(parsed.error));
    }
    return parsed.data;
  }
}

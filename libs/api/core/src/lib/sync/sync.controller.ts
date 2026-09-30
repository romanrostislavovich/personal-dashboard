import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Inject,
  NotFoundException,
  Param,
  Post,
  Req,
  StreamableFile,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  syncActionRequestSchema,
  SyncBackupInfo,
  SyncConflict,
  syncFingerprintsRequestSchema,
  SyncParkedChange,
  SyncParkedKey,
  syncParkedKeySchema,
  SyncStatus,
  syncPullRequestSchema,
  syncPushRequestSchema,
} from '@pd/contracts';
import { IncomingMessage } from 'node:http';
import { z } from 'zod';
import { AuthUser, CurrentUser } from '../auth/current-user.decorator';
import { Public } from '../auth/public.decorator';
import { BackupService } from '../backup/backup.service';
import { AppConfig } from '../config/env';
import { ZodValidationPipe } from '../validation/zod-validation.pipe';
import {
  decodeSyncBody,
  encodeSyncBody,
  isValidSyncToken,
  readRequestBody,
  SYNC_CONTENT_TYPE,
} from './sync-protocol';
import { ServerActions } from './server-actions';
import { SyncClient } from './sync-client.service';
import { SyncConflictsService } from './sync-conflicts.service';
import { SyncStore } from './sync-store';
import { SyncService } from './sync.service';

/**
 * `push`, `pull`, `action`, `fingerprints` and `backup` are called by the client instance
 * (SYNC_TOKEN instead of a user login: sync covers the whole database). The rest is for the
 * settings page.
 */
@Controller('sync')
export class SyncController {
  constructor(
    @Inject(ConfigService) private readonly config: AppConfig,
    private readonly sync: SyncService,
    private readonly client: SyncClient,
    private readonly actions: ServerActions,
    private readonly store: SyncStore,
    private readonly conflictsService: SyncConflictsService,
    private readonly backups: BackupService,
  ) {}

  @Public()
  @Post('push')
  @HttpCode(200)
  async push(@Req() request: IncomingMessage, @Headers('authorization') auth?: string) {
    const body = await this.readBody(request, auth, syncPushRequestSchema);
    return syncBody(await this.sync.receive(body));
  }

  @Public()
  @Post('pull')
  @HttpCode(200)
  async pull(@Req() request: IncomingMessage, @Headers('authorization') auth?: string) {
    const body = await this.readBody(request, auth, syncPullRequestSchema);
    return syncBody(await this.sync.send(body));
  }

  /** A module action the client asks the server to run (see ServerActions). */
  @Public()
  @Post('action')
  @HttpCode(200)
  async action(@Req() request: IncomingMessage, @Headers('authorization') auth?: string) {
    const body = await this.readBody(request, auth, syncActionRequestSchema);
    await this.sync.acceptAction(body);
    const result = await this.actions.execute(body.userId, body.action, body.args);
    return syncBody({ result: result ?? null });
  }

  /** Row counts and hashes of every table, for the client to compare with its own. */
  @Public()
  @Post('fingerprints')
  @HttpCode(200)
  async fingerprints(@Req() request: IncomingMessage, @Headers('authorization') auth?: string) {
    await this.sync.acceptAction(await this.readBody(request, auth, syncFingerprintsRequestSchema));
    // Rows missing from the change log are logged now and reach the client with the next pull.
    await this.store.trackUntracked();
    return syncBody({ tables: await this.store.fingerprints() });
  }

  /** The newest dump, for the client's copy (see BackupService). No handshake: a backup is
   * worth copying even while the two instances run different versions. */
  @Public()
  @Get('backup')
  backupInfo(@Headers('authorization') auth?: string): Promise<SyncBackupInfo> {
    this.checkToken(auth);
    return this.backups.latest();
  }

  @Public()
  @Get('backup/:name')
  async backupFile(@Param('name') name: string, @Headers('authorization') auth?: string) {
    this.checkToken(auth);
    const { stream, size } = await this.backups.open(name);
    return new StreamableFile(stream, {
      type: 'application/octet-stream',
      length: size,
      disposition: `attachment; filename="${name}"`,
    });
  }

  @Get('status')
  status(): Promise<SyncStatus> {
    return this.fullStatus();
  }

  /** "Sync now" on the client. */
  @Post('run')
  async run(): Promise<SyncStatus> {
    await this.requireClient().syncNow();
    return this.fullStatus();
  }

  /** "Resync everything" on the client: mends data that differs from the server's. */
  @Post('resync')
  async resync(): Promise<SyncStatus> {
    await this.requireClient().resyncEverything();
    return this.fullStatus();
  }

  /** "Copy now" on the client: the server's newest dump to this computer. */
  @Post('backup/copy')
  async copyBackup(): Promise<SyncStatus> {
    this.requireClient();
    await this.backups.copyNow();
    return this.fullStatus();
  }

  @Get('conflicts')
  conflicts(@CurrentUser() user: AuthUser): Promise<SyncConflict[]> {
    return this.conflictsService.conflicts(user.id);
  }

  /** Keep the version that lost instead of the current one. */
  @Post('conflicts/:id/keep')
  @HttpCode(204)
  keep(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.conflictsService.keep(user.id, id);
  }

  /** Keep the current row, forget the other version. */
  @Delete('conflicts/:id')
  @HttpCode(204)
  dismiss(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.conflictsService.dismiss(user.id, id);
  }

  @Delete('conflicts')
  @HttpCode(204)
  dismissAll(@CurrentUser() user: AuthUser) {
    return this.conflictsService.dismissAll(user.id);
  }

  @Get('parked')
  parked(@CurrentUser() user: AuthUser): Promise<SyncParkedChange[]> {
    return this.conflictsService.parked(user.id);
  }

  @Post('parked/discard')
  @HttpCode(204)
  discardParked(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(syncParkedKeySchema)) key: SyncParkedKey,
  ) {
    return this.conflictsService.discardParked(user.id, key);
  }

  private async fullStatus(): Promise<SyncStatus> {
    return { ...(await this.sync.status()), backup: await this.backups.status() };
  }

  private requireClient(): SyncClient {
    if (this.sync.mode !== 'client') {
      throw new BadRequestException('This instance is not a sync client');
    }
    return this.client;
  }

  /** Server only, with the right SYNC_TOKEN. */
  private checkToken(auth: string | undefined): void {
    const token = this.config.get('SYNC_TOKEN', { infer: true });
    if (this.sync.mode !== 'server' || !token) {
      throw new NotFoundException();
    }
    if (!isValidSyncToken(auth, token)) {
      throw new UnauthorizedException();
    }
  }

  private async readBody<T>(
    request: IncomingMessage,
    auth: string | undefined,
    schema: z.ZodType<T>,
  ): Promise<T> {
    this.checkToken(auth);
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

/** The sync type only for successful answers: errors stay plain JSON. */
async function syncBody(body: unknown): Promise<StreamableFile> {
  return new StreamableFile(await encodeSyncBody(body), { type: SYNC_CONTENT_TYPE });
}

import {
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  OnApplicationBootstrap,
  OnApplicationShutdown,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BackupStatus, RestoreCheck, SyncBackupInfo } from '@pd/contracts';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, open, rename, stat, unlink, utimes } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { ReadableStream } from 'node:stream/web';
import { AppConfig } from '../config/env';
import { coreMessages } from '../i18n/core.messages';
import { NotificationsService } from '../notifications/notifications.service';
import { SchedulerService } from '../scheduler/scheduler.service';
import { SyncClient } from '../sync/sync-client.service';
import { SyncService } from '../sync/sync.service';
import { UsersService } from '../users/users.service';
import {
  backupProblems,
  DUMP_MAGIC,
  DUMP_NAME,
  listDumps,
  pruneDumps,
  readRestoreCheck,
} from './backup-files';

/** The client looks for a new dump this often (a small request; the dump itself once a day). */
const COPY_INTERVAL_MS = 3_600_000;
/** Not in the middle of startup. */
const FIRST_COPY_DELAY_MS = 60_000;
/** Client: warn about an old copy at most once a day. */
const WARNED_STATE = 'backup-copy-warned';

/**
 * Backups (docs/deploy.md, "Backups"). The server's backup job dumps the database daily and
 * test-restores a dump weekly (deploy/backup.sh); here:
 * - the server watches those dumps (BACKUP_DIR) and tells the owner when something is wrong;
 * - the sync client copies the newest dump to the computer (BACKUP_COPY_DIR) — the copy
 *   that survives losing the server.
 */
@Injectable()
export class BackupService implements OnModuleInit, OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(BackupService.name);
  private timers: NodeJS.Timeout[] = [];
  private copying: Promise<void> | null = null;
  /** Client: why the last copy failed. */
  private lastError: string | null = null;
  /** Client: the server's latest test restore, learned when copying. */
  private serverCheck: RestoreCheck | null = null;

  constructor(
    @Inject(ConfigService) private readonly config: AppConfig,
    private readonly scheduler: SchedulerService,
    private readonly sync: SyncService,
    private readonly syncClient: SyncClient,
    private readonly users: UsersService,
    private readonly notifications: NotificationsService,
  ) {}

  /** Server: the folder with the dumps; unset — the instance has no backup job. */
  private get dumpFolder(): string | undefined {
    return this.config.get('BACKUP_DIR', { infer: true });
  }

  /** Client: where the copies go. */
  private get copyFolder(): string {
    return resolve(this.config.get('BACKUP_COPY_DIR', { infer: true }));
  }

  onModuleInit(): void {
    if (this.dumpFolder) {
      this.scheduler.register({
        name: 'backup.check',
        cron: '0 10 * * *',
        handler: () => this.report(),
      });
    }
  }

  onApplicationBootstrap(): void {
    if (this.sync.mode !== 'client') {
      return;
    }
    const tick = () => void this.copyNow();
    this.timers = [setTimeout(tick, FIRST_COPY_DELAY_MS), setInterval(tick, COPY_INTERVAL_MS)];
  }

  onApplicationShutdown(): void {
    this.timers.forEach(clearTimeout);
  }

  async status(): Promise<BackupStatus | null> {
    const folder = this.dumpFolder;
    if (folder) {
      const dumps = await listDumps(folder);
      const check = await readRestoreCheck(folder);
      return {
        latest: dumps[0] ?? null,
        count: dumps.length,
        folder,
        restoreCheck: check,
        lastError: null,
        problems: backupProblems('server', dumps[0] ?? null, check),
      };
    }
    if (this.sync.mode === 'client') {
      const dumps = await listDumps(this.copyFolder);
      return {
        latest: dumps[0] ?? null,
        count: dumps.length,
        folder: this.copyFolder,
        restoreCheck: this.serverCheck,
        lastError: this.lastError,
        problems: backupProblems('client', dumps[0] ?? null, this.serverCheck),
      };
    }
    return null;
  }

  // --- Server ---

  /** The newest dump and test restore, for the client. */
  async latest(): Promise<SyncBackupInfo> {
    const folder = this.requireFolder();
    return {
      latest: (await listDumps(folder))[0] ?? null,
      restoreCheck: await readRestoreCheck(folder),
    };
  }

  /** A dump by name, for the client to download. */
  async open(name: string): Promise<{ stream: Readable; size: number }> {
    const folder = this.requireFolder();
    if (!DUMP_NAME.test(name)) {
      throw new NotFoundException();
    }
    const path = join(folder, name);
    const size = await stat(path).then(
      (info) => info.size,
      () => {
        throw new NotFoundException();
      },
    );
    return { stream: createReadStream(path), size };
  }

  /** Daily: tells the owner what is wrong with the backups, if anything. */
  async report(): Promise<void> {
    const problems = (await this.status())?.problems ?? [];
    if (problems.length) {
      await this.notifyOwner((text) => [
        text.backupTitle,
        [...problems.map((problem) => text.backupProblems[problem]), text.backupSeeSettings].join(
          '\n',
        ),
      ]);
    }
  }

  private requireFolder(): string {
    const folder = this.dumpFolder;
    if (!folder) {
      throw new NotFoundException('This instance keeps no backups (BACKUP_DIR)');
    }
    return folder;
  }

  // --- Client ---

  /** Copies the server's newest dump unless it is here already. Errors end up in the status. */
  copyNow(): Promise<void> {
    this.copying ??= this.copy().finally(() => (this.copying = null));
    return this.copying;
  }

  private async copy(): Promise<void> {
    const folder = this.copyFolder;
    try {
      const { latest, restoreCheck } = await this.syncClient.backupInfo();
      this.serverCheck = restoreCheck;
      const here = (await listDumps(folder)).find((dump) => dump.name === latest?.name);
      if (latest && here?.size !== latest.size) {
        await mkdir(folder, { recursive: true });
        await this.download(folder, latest.name, latest.size);
        // The copy is as old as the dump, not as the download: "stale" then means stale data.
        const created = new Date(latest.createdAt);
        await utimes(join(folder, latest.name), created, created);
        await pruneDumps(folder, this.config.get('BACKUP_COPY_KEEP', { infer: true }));
        this.logger.log(`Backup copied: ${latest.name} (${Math.round(latest.size / 1e6)} MB)`);
      }
      this.lastError = null;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (this.lastError !== message) {
        this.logger.warn(`Backup copy failed: ${message}`);
      }
      this.lastError = message;
    }
    await this.warnIfStale();
  }

  /** Downloads to a `.part` file first: a broken download never looks like a backup. */
  private async download(folder: string, name: string, size: number): Promise<void> {
    const target = join(folder, name);
    const part = `${target}.part`;
    try {
      const body = await this.syncClient.downloadBackup(name);
      await pipeline(Readable.fromWeb(body as ReadableStream), createWriteStream(part));
      const got = (await stat(part)).size;
      if (got !== size) {
        throw new Error(`The download was cut short (${got} of ${size} bytes)`);
      }
      const file = await open(part);
      const head = Buffer.alloc(DUMP_MAGIC.length);
      await file.read(head, 0, head.length, 0);
      await file.close();
      if (head.toString('latin1') !== DUMP_MAGIC) {
        throw new Error('The download is not a database dump');
      }
      await rename(part, target);
    } finally {
      await unlink(part).catch(() => undefined);
    }
  }

  /**
   * The newest copy is days old (the computer was off, or the server stopped dumping). No copy
   * at all is only shown in the settings: right after setting up, the first one is on its way.
   */
  private async warnIfStale(): Promise<void> {
    const status = await this.status();
    if (!status?.latest || !status.problems.includes('stale')) {
      return;
    }
    const today = new Date().toISOString().slice(0, 10);
    if ((await this.sync.getState(WARNED_STATE)) === today) {
      return;
    }
    await this.sync.setState(WARNED_STATE, today);
    const days = Math.floor(
      (Date.now() - new Date(status.latest.createdAt).getTime()) / 86_400_000,
    );
    await this.notifyOwner((text) => [
      text.backupTitle,
      [text.backupCopyStale(days), status.lastError].filter(Boolean).join('\n'),
    ]);
  }

  private async notifyOwner(
    compose: (text: ReturnType<typeof coreMessages>) => [string, string],
  ): Promise<void> {
    const owner = await this.users.owner();
    if (owner) {
      const [title, body] = compose(coreMessages(owner.locale));
      await this.notifications.send(owner.id, { title, body, source: 'backup' });
    }
  }
}

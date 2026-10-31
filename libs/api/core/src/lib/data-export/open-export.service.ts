import {
  Inject,
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
  OnModuleInit,
} from '@nestjs/common';
import {ConfigService} from '@nestjs/config';
import {mkdir, rename, rm} from 'node:fs/promises';
import {join, resolve} from 'node:path';
import {AppConfig} from '../config/env';
import {SchedulerService} from '../scheduler/scheduler.service';
import {SyncService} from '../sync/sync.service';
import {UsersService} from '../users/users.service';
import {FolderWriter} from './data-archive';
import {DataExportService} from './data-export.service';

const DAY_MS = 24 * 60 * 60 * 1000;
/** The copy's own folder inside OPEN_EXPORT_DIR. */
const COPY_FOLDER = 'personal-dashboard';
/** Credentials, not the user's data: a bank's access session stays out of a plain file. */
const NOT_IN_COPY: Record<string, string[]> = {
  finance_bank_connections: ['session_id'],
};
/** Not in the middle of startup. */
const FIRST_RUN_DELAY_MS = 120_000;

/**
 * The open copy (docs/deploy.md, "An open copy"): once a day the owner's data is written to
 * OPEN_EXPORT_DIR/personal-dashboard/data as plain files — the archive's layout (data/*.jsonl, the diary in
 * Markdown, finance in CSV, the photos) — so it can be read, searched and kept without the
 * dashboard running. Written into a new folder that then takes the old one's place, so a reader
 * never sees half of it. The server makes it as a job; a sync client (which runs no jobs) on a
 * timer — it is the computer's copy that matters most.
 */
@Injectable()
export class OpenExportService
  implements OnModuleInit, OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(OpenExportService.name);
  private timers: NodeJS.Timeout[] = [];
  private running: Promise<void> | null = null;

  constructor(
    @Inject(ConfigService) private readonly config: AppConfig,
    private readonly users: UsersService,
    private readonly exports: DataExportService,
    private readonly scheduler: SchedulerService,
    private readonly sync: SyncService,
  ) {}

  private get folder(): string | null {
    const folder = this.config.get('OPEN_EXPORT_DIR', {infer: true});
    return folder ? resolve(folder) : null;
  }

  onModuleInit(): void {
    if (this.folder && this.sync.mode !== 'client') {
      this.scheduler.register({
        name: 'core.open-export',
        cron: '30 4 * * *',
        handler: () => this.writeAll(),
      });
    }
  }

  onApplicationBootstrap(): void {
    if (!this.folder || this.sync.mode !== 'client') {
      return;
    }
    const tick = () =>
      void this.writeAll().catch(error =>
        this.logger.error(`The open copy was not written: ${error}`),
      );
    this.timers = [
      setTimeout(tick, FIRST_RUN_DELAY_MS),
      setInterval(tick, DAY_MS),
    ];
  }

  onApplicationShutdown(): void {
    this.timers.forEach(timer => clearTimeout(timer));
  }

  /** The copy; one at a time, a second call waits for the running one. */
  writeAll(): Promise<void> {
    this.running ??= this.writeEveryone().finally(() => (this.running = null));
    return this.running;
  }

  /** The owner's copy only: other accounts did not ask for their data on this disk. */
  private async writeEveryone(): Promise<void> {
    const folder = this.folder;
    const owner = folder ? await this.users.owner() : undefined;
    if (!folder || !owner) {
      return;
    }
    // A folder of its own inside OPEN_EXPORT_DIR: the swap below never touches anything else.
    const root = join(folder, COPY_FOLDER);
    await mkdir(root, {recursive: true});
    const final = join(root, 'data');
    const fresh = join(root, '.data.new');
    const old = join(root, '.data.old');
    await rm(fresh, {recursive: true, force: true});
    await this.exports.writeInto(
      owner.id,
      new FolderWriter(fresh),
      NOT_IN_COPY,
    );
    await rm(old, {recursive: true, force: true});
    await rename(final, old).catch(() => undefined);
    await rename(fresh, final);
    await rm(old, {recursive: true, force: true});
    this.logger.log(`The open copy is in ${final}`);
  }
}

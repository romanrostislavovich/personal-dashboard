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
import {DB, Database} from '../database/database.module';
import {SchedulerService} from '../scheduler/scheduler.service';
import {SyncService} from '../sync/sync.service';
import {users} from '../users/users.schema';
import {FolderWriter} from './data-archive';
import {DataExportService} from './data-export.service';

const DAY_MS = 24 * 60 * 60 * 1000;
/** Not in the middle of startup. */
const FIRST_RUN_DELAY_MS = 120_000;

/**
 * The open copy (docs/deploy.md, "An open copy"): once a day every user's data is written to
 * OPEN_EXPORT_DIR/<user> as plain files — the archive's layout (data/*.jsonl, the diary in
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
    @Inject(DB) private readonly db: Database,
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

  /** Every user's copy; one at a time, a second call waits for the running one. */
  writeAll(): Promise<void> {
    this.running ??= this.writeEveryone().finally(() => (this.running = null));
    return this.running;
  }

  private async writeEveryone(): Promise<void> {
    const folder = this.folder;
    if (!folder) {
      return;
    }
    await mkdir(folder, {recursive: true});
    const all = await this.db
      .select({id: users.id, email: users.email})
      .from(users);
    const taken = new Set<string>();
    for (const user of all) {
      // Two addresses with the same name before the "@": the second goes by its id.
      let name = folderName(user.email, user.id);
      name = taken.has(name) ? user.id : name;
      taken.add(name);
      await this.writeOne(folder, user.id, name);
    }
    this.logger.log(`The open copy of ${all.length} user(s) is in ${folder}`);
  }

  private async writeOne(
    folder: string,
    userId: string,
    name: string,
  ): Promise<void> {
    const final = join(folder, name);
    const fresh = join(folder, `.${name}.new`);
    const old = join(folder, `.${name}.old`);
    await rm(fresh, {recursive: true, force: true});
    await this.exports.writeInto(userId, new FolderWriter(fresh));
    await rm(old, {recursive: true, force: true});
    await rename(final, old).catch(() => undefined);
    await rename(fresh, final);
    await rm(old, {recursive: true, force: true});
  }
}

/** `roman@example.com` → `roman`; what is left of a strange address — its id. */
export function folderName(email: string, id: string): string {
  const local = email
    .split('@')[0]
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, '');
  return local && !local.startsWith('.') ? local : id;
}

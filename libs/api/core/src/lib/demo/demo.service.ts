import { Inject, Injectable, Logger, OnApplicationBootstrap, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LocalDate, zonedDateTime } from '@pd/contracts';
import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { randomBytes } from 'node:crypto';
import { AppConfig } from '../config/env';
import { DB, Database } from '../database/database.module';
import { SchedulerService } from '../scheduler/scheduler.service';
import { UserRow, users } from '../users/users.schema';
import { UsersService } from '../users/users.service';

/** The visitor of a demo instance: everybody signs in as this one user. */
export const DEMO_EMAIL = 'demo@example.com';
const DEMO_NAME = 'Alex';

/** What a seed is given: whose data to make, and the day the data is "today" for. */
export interface DemoContext {
  userId: string;
  today: LocalDate;
  /** `daysAgo(3)` — the day three days before today. */
  daysAgo(days: number): LocalDate;
  /** Projects made by the core, by name: the modules hang their data on them. */
  projects: Record<'shop' | 'blog', string>;
}

/**
 * The sample data of a section (`<module>.demo.ts`). A module knows its own tables; the core
 * only calls the seeds in turn:
 *
 * ```ts
 * demo.register({ module: 'tasks', seed: (ctx) => this.fill(ctx) });
 * ```
 */
export interface DemoSeed {
  module: string;
  seed(context: DemoContext): Promise<void>;
}

/**
 * A demo instance (`DEMO_MODE=true`): one shared user with made-up data, so the dashboard can
 * be tried without connecting anything. The user is made at the first start and made anew
 * every night — whatever visitors changed is gone, and "today" in the data is today again.
 * Nobody knows the user's password: visitors come in through `POST /auth/demo`.
 *
 * What the demo user may do is limited by DemoGuard; jobs that reach outside services do not
 * run on a demo instance at all (SchedulerService).
 */
@Injectable()
export class DemoService implements OnModuleInit, OnApplicationBootstrap {
  private readonly logger = new Logger(DemoService.name);
  private readonly seeds: DemoSeed[] = [];
  /** The demo user's id, to tell their requests apart without asking the database each time. */
  private demoUserId: string | null = null;

  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(ConfigService) private readonly config: AppConfig,
    private readonly usersService: UsersService,
    private readonly scheduler: SchedulerService,
  ) {}

  get enabled(): boolean {
    return this.config.get('DEMO_MODE', { infer: true });
  }

  register(seed: DemoSeed): void {
    this.seeds.push(seed);
  }

  onModuleInit(): void {
    if (!this.enabled) {
      return;
    }
    this.scheduler.register({
      name: 'demo.reset',
      cron: '15 4 * * *',
      demo: true,
      handler: () => this.reset(),
    });
  }

  /** After every module has registered its seed. */
  async onApplicationBootstrap(): Promise<void> {
    if (!this.enabled) {
      return;
    }
    const existing = await this.usersService.findByEmail(DEMO_EMAIL);
    this.demoUserId = existing?.id ?? null;
    if (!existing) {
      await this.reset();
    }
    this.logger.warn(
      'DEMO_MODE is on: anybody can sign in as the demo user, and its data is made anew ' +
        'every night. Do not keep real data on this instance.',
    );
  }

  isDemoUser(userId: string): boolean {
    return this.enabled && userId === this.demoUserId;
  }

  /** The demo user, for a visitor to be signed in as. */
  async user(): Promise<UserRow> {
    const user = await this.usersService.findByEmail(DEMO_EMAIL);
    if (!user) {
      throw new Error('The demo user is not there yet');
    }
    return user;
  }

  /**
   * Makes the demo user and its data anew. Every table of a user's data hangs on the user
   * (`on delete cascade`), so deleting the user is deleting everything of theirs.
   */
  async reset(): Promise<void> {
    await this.db.delete(users).where(eq(users.email, DEMO_EMAIL));
    const user = await this.usersService.create({
      email: DEMO_EMAIL,
      // Nobody is told it: the demo is entered without a password.
      passwordHash: await bcrypt.hash(randomBytes(24).toString('hex'), 10),
      displayName: DEMO_NAME,
      locale: this.config.get('DEFAULT_LOCALE', { infer: true }),
    });
    this.demoUserId = user.id;

    const today = zonedDateTime(new Date(), this.usersService.timeZoneOf(user)).date;
    const context: DemoContext = {
      userId: user.id,
      today,
      daysAgo: (days) => {
        const date = new Date(`${today}T12:00:00Z`);
        date.setUTCDate(date.getUTCDate() - days);
        return date.toISOString().slice(0, 10);
      },
      projects: { shop: '', blog: '' },
    };
    // The core's own seed comes first: the modules need its projects.
    const ordered = [...this.seeds].sort(
      (a, b) => Number(b.module === 'core') - Number(a.module === 'core'),
    );
    for (const seed of ordered) {
      try {
        await seed.seed(context);
      } catch (error) {
        // One section without its sample data is better than no demo at all.
        this.logger.error(`Demo data of ${seed.module} was not made: ${String(error)}`);
      }
    }
    this.logger.log(`Demo data made for ${ordered.length} sections`);
  }
}

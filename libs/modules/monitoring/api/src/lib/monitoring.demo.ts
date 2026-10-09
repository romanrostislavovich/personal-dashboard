import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { DB, Database, DemoService } from '@pd/api-core';
import { checkResults, monitors } from './monitoring.schema';

const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * MINUTE_MS;
/** A check every five minutes for two weeks. */
const CHECKS = (14 * 24 * 60) / 5;
/** The shop was down for a quarter of an hour two days ago: these checks failed. */
const DOWN_FROM = (2 * 24 * 60) / 5;
const DOWN_CHECKS = 3;
const INSERT_CHUNK = 2000;

/**
 * The demo data of Monitoring: two sites with two weeks of checks and one short outage. On a
 * demo instance the checks themselves do not run — the addresses are made up.
 */
@Injectable()
export class MonitoringDemo implements OnModuleInit {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly demo: DemoService,
  ) {}

  onModuleInit(): void {
    this.demo.register({
      module: 'monitoring',
      seed: async ({ userId, projects }) => {
        const now = Date.now();
        const sites = [
          { projectId: projects.shop, url: 'https://tea-shop.example.com', ms: 182, outage: true },
          { projectId: projects.blog, url: 'https://blog.example.com', ms: 96, outage: false },
        ];
        for (const site of sites) {
          const [monitor] = await this.db
            .insert(monitors)
            .values({
              userId,
              projectId: site.projectId,
              url: site.url,
              status: 'up',
              lastCheckedAt: new Date(now),
              lastStatusCode: 200,
              lastResponseMs: site.ms,
              sslExpiresAt: new Date(now + 61 * DAY_MS),
            })
            .returning();
          const checks = Array.from({ length: CHECKS }, (_, index) => {
            const isUp = !(site.outage && index >= DOWN_FROM && index < DOWN_FROM + DOWN_CHECKS);
            return {
              monitorId: monitor.id,
              checkedAt: new Date(now - index * 5 * MINUTE_MS),
              isUp,
              statusCode: isUp ? 200 : 502,
              // A response time that wanders a little, the same on every run.
              responseMs: isUp ? site.ms + ((index * 37) % 60) : null,
            };
          });
          for (let i = 0; i < checks.length; i += INSERT_CHUNK) {
            await this.db.insert(checkResults).values(checks.slice(i, i + INSERT_CHUNK));
          }
        }
      },
    });
  }
}

import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { automationRules } from '../automations/automations.schema';
import { DB, Database } from '../database/database.module';
import { ProjectsService } from '../projects/projects.service';
import { DemoService } from './demo.service';

/**
 * The core's part of the demo data: the projects the sections hang their data on, and a rule
 * that joins two of them.
 */
@Injectable()
export class CoreDemo implements OnModuleInit {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly demo: DemoService,
    private readonly projects: ProjectsService,
  ) {}

  onModuleInit(): void {
    this.demo.register({
      module: 'core',
      seed: async (context) => {
        const shop = await this.projects.create(context.userId, {
          name: 'Tea Shop',
          url: 'https://tea-shop.example.com',
          description: 'A small online shop: the side project.',
          aliases: ['alex/tea-shop', 'tea-shop'],
        });
        const blog = await this.projects.create(context.userId, {
          name: 'Blog',
          url: 'https://blog.example.com',
          description: null,
          aliases: [],
        });
        context.projects.shop = shop.id;
        context.projects.blog = blog.id;

        await this.db.insert(automationRules).values({
          userId: context.userId,
          name: 'A gift a week before a birthday',
          trigger: 'birthdays.upcoming',
          triggerParams: { days: '7' },
          action: 'tasks.create',
          actionParams: { title: 'Buy a gift: {{name}} ({{date}}) {{ideas}}', due: 'none' },
        });
      },
    });
  }
}

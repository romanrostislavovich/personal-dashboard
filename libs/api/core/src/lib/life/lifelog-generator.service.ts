import { BadRequestException, Injectable } from '@nestjs/common';
import {
  LifelogNarrative,
  lifelogAiResultSchema,
  lifelogDaySchema,
  zonedDateTime,
} from '@pd/contracts';
import { AiService } from '../ai/ai.service';
import { UsersService } from '../users/users.service';
import { LifeService } from './life.service';
import { LIFELOG_INSTRUCTION, lifelogFacts } from './lifelog-generation';
import { lifelogMessages } from './lifelog.messages';
import { LifelogService } from './lifelog.service';

@Injectable()
export class LifelogGenerator {
  private readonly pending = new Map<string, Promise<LifelogNarrative | null>>();

  constructor(
    private readonly lifelog: LifelogService,
    private readonly life: LifeService,
    private readonly ai: AiService,
    private readonly users: UsersService,
  ) {}

  generate(userId: string, day: string): Promise<LifelogNarrative | null> {
    lifelogDaySchema.parse(day);
    const key = `${userId}:${day}`;
    const existing = this.pending.get(key);
    if (existing) return existing;
    const work = this.write(userId, day).finally(() => this.pending.delete(key));
    this.pending.set(key, work);
    return work;
  }

  private async write(userId: string, day: string): Promise<LifelogNarrative | null> {
    const user = await this.users.findById(userId);
    const messages = lifelogMessages(user?.locale);
    if (day > zonedDateTime(new Date(), this.users.timeZoneOf(user)).date) {
      throw new BadRequestException(messages.futureDay);
    }
    const existing = await this.lifelog.get(userId, day);
    if (existing?.summaryText) return existing;
    if (!(await this.ai.isConfigured(userId))) throw new BadRequestException(messages.noAi);
    const hidden = await this.ai.hiddenFromShared(userId);
    const timeline = await this.life.day(userId, day, hidden);
    // Defense in depth: a misbehaving Life source must not reintroduce a hidden module.
    const facts = lifelogFacts(timeline.events.filter((event) => !hidden.includes(event.module)));
    if (!facts.length) return null;
    const reply = await this.ai.complete(
      userId,
      LIFELOG_INSTRUCTION,
      JSON.stringify({ day, events: facts }),
    );
    let content: unknown;
    try {
      content = JSON.parse(
        reply
          .trim()
          .replace(/^```(?:json)?\s*/i, '')
          .replace(/\s*```$/, ''),
      );
    } catch {
      throw new BadRequestException(messages.invalidReply);
    }
    const parsed = lifelogAiResultSchema.safeParse(content);
    if (!parsed.success) throw new BadRequestException(messages.invalidReply);
    return this.lifelog.saveGenerated(userId, day, {
      ...parsed.data,
      generatedBy: 'ai',
      sources: facts.map(({ module, key, at }) => ({ module, key, at })),
    });
  }
}

import { Inject, Injectable } from '@nestjs/common';
import { LifeStory, LocalDate } from '@pd/contracts';
import { and, eq } from 'drizzle-orm';
import { AiService } from '../ai/ai.service';
import { DB, Database } from '../database/database.module';
import { lifeStories } from './life.schema';
import { LifeService } from './life.service';

const INSTRUCTION =
  "You get the numbers of the user's past PERIOD across a personal dashboard: each card has " +
  'a `key` (what it is, e.g. finance.life.spentTotal), a `value`, its `format` and details. ' +
  'Write a warm, short story of it like a "Wrapped": the highlights first, a little humour, ' +
  'no lists of every number, no advice. Plain text, emoji welcome, LENGTH.';

/**
 * The AI's story of a month or a year over the numbers of every module, kept once written:
 * shown on the summary page and sent on the 1st of a month and of a year.
 */
@Injectable()
export class LifeStoriesService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly life: LifeService,
    private readonly ai: AiService,
  ) {}

  async get(userId: string, period: string): Promise<LifeStory | null> {
    const [row] = await this.db
      .select()
      .from(lifeStories)
      .where(and(eq(lifeStories.userId, userId), eq(lifeStories.period, period)));
    return row ? toStory(row) : null;
  }

  /**
   * Writes (or writes again) the story of `YYYY-MM` or `YYYY`; `null` — nothing to tell, or no
   * AI. The AI sees only the modules the user lets it see (Settings → AI → privacy).
   */
  async write(userId: string, period: string): Promise<LifeStory | null> {
    const cards = await this.life.period(userId, periodRange(period));
    const seen = await Promise.all(cards.map((card) => this.ai.canSee(userId, card.module)));
    const forAi = cards.filter((_, index) => seen[index]);
    if (!forAi.length || !(await this.ai.isConfigured(userId))) {
      return null;
    }
    const year = period.length === 4;
    const instruction = INSTRUCTION.replace('PERIOD', year ? 'year' : 'month').replace(
      'LENGTH',
      year ? '10–15 lines' : '5–8 lines',
    );
    const text = (
      await this.ai.complete(userId, instruction, JSON.stringify({ period, cards: forAi }))
    ).trim();
    if (!text) {
      return null;
    }
    const [row] = await this.db
      .insert(lifeStories)
      .values({ userId, period, text })
      .onConflictDoUpdate({
        target: [lifeStories.userId, lifeStories.period],
        set: { text, createdAt: new Date() },
      })
      .returning();
    return toStory(row);
  }
}

/** The days of `YYYY` or `YYYY-MM`. */
export function periodRange(period: string): { from: LocalDate; to: LocalDate } {
  if (period.length === 4) {
    return { from: `${period}-01-01`, to: `${period}-12-31` };
  }
  const [year, month] = period.split('-').map(Number);
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return { from: `${period}-01`, to: `${period}-${String(last).padStart(2, '0')}` };
}

function toStory(row: typeof lifeStories.$inferSelect): LifeStory {
  return { period: row.period, text: row.text, createdAt: row.createdAt.toISOString() };
}

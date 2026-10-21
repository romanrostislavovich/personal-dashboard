import { Inject, Injectable } from '@nestjs/common';
import {
  LifelogGenerated,
  LifelogNarrative,
  LifelogQuery,
  lifelogDaySchema,
  lifelogGeneratedSchema,
  lifelogNoteSchema,
  lifelogQuerySchema,
} from '@pd/contracts';
import { and, asc, eq, gte, lte } from 'drizzle-orm';
import { DB, Database } from '../database/database.module';
import { lifelogNarratives, lifelogSettings } from './life.schema';
import { LifelogSettings, lifelogSettingsSchema } from '@pd/contracts';

@Injectable()
export class LifelogService {
  constructor(@Inject(DB) private readonly db: Database) {}

  async settings(userId: string): Promise<LifelogSettings> {
    const [row] = await this.db
      .select()
      .from(lifelogSettings)
      .where(eq(lifelogSettings.userId, userId));
    return { enabled: row?.enabled ?? false };
  }

  async configure(userId: string, input: LifelogSettings): Promise<LifelogSettings> {
    const settings = lifelogSettingsSchema.parse(input);
    await this.db
      .insert(lifelogSettings)
      .values({ userId, ...settings })
      .onConflictDoUpdate({
        target: lifelogSettings.userId,
        set: settings,
      });
    return settings;
  }

  async list(userId: string, input: LifelogQuery): Promise<LifelogNarrative[]> {
    const { from, to } = lifelogQuerySchema.parse(input);
    const rows = await this.db
      .select()
      .from(lifelogNarratives)
      .where(
        and(
          eq(lifelogNarratives.userId, userId),
          gte(lifelogNarratives.day, from),
          lte(lifelogNarratives.day, to),
        ),
      )
      .orderBy(asc(lifelogNarratives.day));
    return rows.map(toNarrative);
  }

  async get(userId: string, day: string): Promise<LifelogNarrative | null> {
    const [row] = await this.db
      .select()
      .from(lifelogNarratives)
      .where(
        and(
          eq(lifelogNarratives.userId, userId),
          eq(lifelogNarratives.day, lifelogDaySchema.parse(day)),
        ),
      );
    return row ? toNarrative(row) : null;
  }

  async saveNote(userId: string, day: string, note: string): Promise<LifelogNarrative> {
    const input = lifelogNoteSchema.parse({ note });
    const [row] = await this.db
      .insert(lifelogNarratives)
      .values({
        userId,
        day: lifelogDaySchema.parse(day),
        note: input.note,
      })
      .onConflictDoUpdate({
        target: [lifelogNarratives.userId, lifelogNarratives.day],
        set: { note: input.note, updatedAt: new Date() },
      })
      .returning();
    return toNarrative(row);
  }

  async saveGenerated(
    userId: string,
    day: string,
    generated: LifelogGenerated,
  ): Promise<LifelogNarrative> {
    const input = lifelogGeneratedSchema.parse(generated);
    const now = new Date();
    const [row] = await this.db
      .insert(lifelogNarratives)
      .values({
        userId,
        day: lifelogDaySchema.parse(day),
        note: '',
        ...input,
        generatedAt: now,
      })
      .onConflictDoUpdate({
        target: [lifelogNarratives.userId, lifelogNarratives.day],
        set: { ...input, generatedAt: now, updatedAt: now },
      })
      .returning();
    return toNarrative(row);
  }

  async remove(userId: string, day: string): Promise<void> {
    await this.db
      .delete(lifelogNarratives)
      .where(
        and(
          eq(lifelogNarratives.userId, userId),
          eq(lifelogNarratives.day, lifelogDaySchema.parse(day)),
        ),
      );
  }
}

function toNarrative(row: typeof lifelogNarratives.$inferSelect): LifelogNarrative {
  return {
    id: row.id,
    day: row.day,
    summaryText: row.summaryText,
    keyHighlight: row.keyHighlight,
    generatedBy: row.generatedBy,
    sources: row.sources,
    note: row.note,
    generatedAt: row.generatedAt?.toISOString() ?? null,
    updatedAt: row.updatedAt.toISOString(),
  };
}

import {Inject, Injectable, NotFoundException} from '@nestjs/common';
import {AiMemory} from '@pd/contracts';
import {and, asc, eq} from 'drizzle-orm';
import {DB, Database} from '../database/database.module';
import {aiMemories} from './ai.schema';

/** The prompt carries at most this many: a memory is a few lines, not a diary. */
export const MAX_MEMORIES = 100;

/**
 * What the assistant keeps between conversations, because the user told it ("remember that I
 * am vegetarian"): short facts, shown in the AI settings, removed there or by asking. They go
 * into every conversation's instructions (see systemPrompt), so the model knows them without a
 * tool call.
 */
@Injectable()
export class AiMemoryService {
  constructor(@Inject(DB) private readonly db: Database) {}

  async list(userId: string): Promise<AiMemory[]> {
    const rows = await this.db
      .select()
      .from(aiMemories)
      .where(eq(aiMemories.userId, userId))
      .orderBy(asc(aiMemories.createdAt))
      .limit(MAX_MEMORIES);
    return rows.map(row => ({
      id: row.id,
      text: row.text,
      createdAt: row.createdAt.toISOString(),
    }));
  }

  async add(userId: string, text: string): Promise<AiMemory> {
    const [row] = await this.db
      .insert(aiMemories)
      .values({userId, text})
      .returning();
    return {id: row.id, text: row.text, createdAt: row.createdAt.toISOString()};
  }

  async remove(userId: string, id: string): Promise<void> {
    const removed = await this.db
      .delete(aiMemories)
      .where(and(eq(aiMemories.id, id), eq(aiMemories.userId, userId)))
      .returning({id: aiMemories.id});
    if (!removed.length) {
      throw new NotFoundException('No such memory');
    }
  }
}

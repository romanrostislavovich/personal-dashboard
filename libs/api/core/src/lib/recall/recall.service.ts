import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { AiRecallHit } from '@pd/contracts';
import { and, eq, inArray, notInArray, sql } from 'drizzle-orm';
import { AiConnectionsService } from '../ai/ai-connections.service';
import { aiConnections } from '../ai/ai.schema';
import { embed } from '../ai/openai-compatible.client';
import { DB, Database } from '../database/database.module';
import { SchedulerService } from '../scheduler/scheduler.service';
import { UsersService } from '../users/users.service';
import { documentText, hashOf, nearest, RecallItem, withTask } from './recall-math';
import { recallVectors } from './recall.schema';

export type { RecallItem } from './recall-math';

/**
 * A section's part of search by meaning: its items as text (decrypted where the section
 * encrypts them). A module registers it in `onModuleInit` (`<module>.recall.ts`):
 *
 * ```ts
 * recall.register({ module: 'diary', items: (userId) => this.diary.recallItems(userId) });
 * ```
 */
export interface RecallSource {
  module: string;
  items: (userId: string) => Promise<RecallItem[]>;
}

/** Texts sent to the embedding model at once. */
const BATCH = 16;
/** Less alike than this is not "found". */
const MIN_SCORE = 0.45;
const SNIPPET_CHARS = 300;

/**
 * Search by meaning over the user's own history ("when did I last have these symptoms?"): the
 * sections' items are turned into vectors by the embedding connection (a local model keeps
 * them on the server) every hour, and a question is compared with all of them. Only the
 * sections the AI may see are indexed and searched.
 */
@Injectable()
export class RecallService implements OnModuleInit {
  private readonly logger = new Logger(RecallService.name);
  private readonly sources: RecallSource[] = [];

  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly connections: AiConnectionsService,
    private readonly scheduler: SchedulerService,
    private readonly users: UsersService,
  ) {}

  onModuleInit(): void {
    this.scheduler.register({
      name: 'ai.recall-index',
      cron: '23 * * * *',
      handler: () => this.indexAll(),
    });
  }

  register(source: RecallSource): void {
    this.sources.push(source);
  }

  /**
   * Brings the user's index up to date: new and changed items get a vector, gone ones lose
   * theirs. Returns how many items are indexed; `null` — no embedding connection.
   */
  async index(userId: string): Promise<number | null> {
    const connection = await this.connections.embedding(userId);
    if (!connection) {
      return null;
    }
    const model = connection.model;
    const visible = await this.visibleSources(userId);
    // A section switched off for the AI, or a different model: its vectors go.
    await this.db.delete(recallVectors).where(
      and(
        eq(recallVectors.userId, userId),
        visible.length
          ? sql`(${notInArray(
              recallVectors.module,
              visible.map((s) => s.module),
            )} OR ${recallVectors.model} <> ${model})`
          : sql`true`,
      ),
    );
    let total = 0;
    for (const source of visible) {
      const items = await source.items(userId);
      total += items.length;
      const known = new Map(
        (
          await this.db
            .select({ itemId: recallVectors.itemId, hash: recallVectors.hash })
            .from(recallVectors)
            .where(and(eq(recallVectors.userId, userId), eq(recallVectors.module, source.module)))
        ).map((row) => [row.itemId, row.hash]),
      );
      const stale = items
        .map((item) => ({ item, text: documentText(item) }))
        .map((one) => ({ ...one, hash: hashOf(one.text) }))
        .filter((one) => known.get(one.item.id) !== one.hash);
      for (let at = 0; at < stale.length; at += BATCH) {
        const batch = stale.slice(at, at + BATCH);
        const vectors = await embed(
          connection,
          batch.map((one) => withTask(model, 'document', one.text)),
        );
        await this.db
          .insert(recallVectors)
          .values(
            batch.map((one, i) => ({
              userId,
              module: source.module,
              itemId: one.item.id,
              model,
              hash: one.hash,
              vector: vectors[i],
            })),
          )
          .onConflictDoUpdate({
            target: [recallVectors.userId, recallVectors.module, recallVectors.itemId],
            set: {
              model: sql`excluded.model`,
              hash: sql`excluded.hash`,
              vector: sql`excluded.vector`,
              updatedAt: sql`now()`,
            },
          });
      }
      const ids = items.map((item) => item.id);
      await this.db
        .delete(recallVectors)
        .where(
          and(
            eq(recallVectors.userId, userId),
            eq(recallVectors.module, source.module),
            ids.length ? notInArray(recallVectors.itemId, ids) : sql`true`,
          ),
        );
    }
    return total;
  }

  /**
   * The items closest in meaning to the question. An empty index is built first (the first
   * search of a new user waits for it). `null` — no embedding connection.
   */
  async search(
    userId: string,
    question: string,
    { count = 8, module }: { count?: number; module?: string } = {},
  ): Promise<AiRecallHit[] | null> {
    const connection = await this.connections.embedding(userId);
    if (!connection) {
      return null;
    }
    const visible = (await this.visibleSources(userId)).filter(
      (source) => !module || source.module === module,
    );
    if (!visible.length) {
      return [];
    }
    const modules = visible.map((source) => source.module);
    const load = () =>
      this.db
        .select({
          module: recallVectors.module,
          itemId: recallVectors.itemId,
          vector: recallVectors.vector,
        })
        .from(recallVectors)
        .where(
          and(
            eq(recallVectors.userId, userId),
            eq(recallVectors.model, connection.model),
            inArray(recallVectors.module, modules),
          ),
        );
    let rows = await load();
    if (!rows.length) {
      await this.index(userId);
      rows = await load();
    }
    const [query] = await embed(connection, [withTask(connection.model, 'query', question)]);
    const found = nearest(query, rows, count, MIN_SCORE);
    // The text is read from the section itself: the index keeps no text.
    const hits: AiRecallHit[] = [];
    for (const source of visible) {
      const wanted = found.filter((hit) => hit.module === source.module);
      if (!wanted.length) {
        continue;
      }
      const items = new Map((await source.items(userId)).map((item) => [item.id, item]));
      for (const hit of wanted) {
        const item = items.get(hit.itemId);
        if (item) {
          hits.push({
            module: source.module,
            id: item.id,
            title: item.title,
            text: item.text.slice(0, SNIPPET_CHARS),
            date: item.date,
            link: item.link,
            score: Math.round(hit.score * 100) / 100,
          });
        }
      }
    }
    return hits.sort((a, b) => b.score - a.score);
  }

  /** How many items the user's index holds. */
  async indexed(userId: string): Promise<number> {
    const [row] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(recallVectors)
      .where(eq(recallVectors.userId, userId));
    return row?.count ?? 0;
  }

  /** Every hour: the index of each user with a connection that can make vectors. */
  private async indexAll(): Promise<void> {
    const rows = await this.db.selectDistinct({ userId: aiConnections.userId }).from(aiConnections);
    for (const { userId } of rows) {
      await this.index(userId).catch((error) =>
        this.logger.warn(`Search by meaning: indexing failed for ${userId}: ${error}`),
      );
    }
  }

  /**
   * The sections whose texts may go to the embedding model: not the ones switched off for
   * the AI, nor the ones kept to a connection of their own (Health on a local model) — the
   * embedding connection may be a cloud one.
   */
  private async visibleSources(userId: string): Promise<RecallSource[]> {
    const hidden = new Set([
      ...(await this.connections.hiddenFromShared(userId)),
      ...this.users.hiddenSections(await this.users.findById(userId)),
    ]);
    return this.sources.filter((source) => !hidden.has(source.module));
  }
}

import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DB, Database, withoutTrash, ZodValidationPipe } from '@pd/api-core';
import {
  Workstate,
  workstateCaptureSchema,
  workstateIdSchema,
  workstateInputSchema,
  WorkstatePage,
  workstateQuerySchema,
  WorkstateRestorePlan,
  workstateSchema,
  workstateRestoreRequestSchema,
} from '@pd/contracts';
import { and, desc, eq, gte, lt, lte, or } from 'drizzle-orm';
import { ActivityContextStore } from './activity-context.store';
import { contextCutoff, restorePlan, sanitizeWorkstate } from './activity-context.policy';
import { activityWorkstates } from './activity-context.schema';

@Injectable()
export class WorkstateService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly context: ActivityContextStore,
  ) {}

  async capture(userId: string, input: unknown, deviceId?: string): Promise<Workstate> {
    const body = new ZodValidationPipe(workstateInputSchema).transform(input);
    const now = Date.now();
    if (
      Date.parse(body.capturedAt) < contextCutoff(now).getTime() ||
      Date.parse(body.capturedAt) > now + 60_000
    ) {
      throw new BadRequestException('Capture outside retention window');
    }
    if (deviceId) await this.context.verifyDevice(userId, deviceId);
    const words = await this.context.privateWords(userId);
    await this.db
      .insert(activityWorkstates)
      .values({
        userId,
        id: body.id,
        deviceId: deviceId ?? null,
        capturedAt: new Date(body.capturedAt),
        capture: JSON.stringify(sanitizeWorkstate(body.capture, words)),
      })
      .onConflictDoNothing({ target: [activityWorkstates.userId, activityWorkstates.id] });
    const state = await this.get(userId, body.id);
    if (state.deviceId !== (deviceId ?? null))
      throw new ConflictException('Capture ID already used');
    return state;
  }

  async get(userId: string, id: string): Promise<Workstate> {
    const parsed = new ZodValidationPipe(workstateIdSchema).transform(id);
    const [row] = await this.db
      .select()
      .from(activityWorkstates)
      .where(
        and(
          eq(activityWorkstates.userId, userId),
          eq(activityWorkstates.id, parsed),
          gte(activityWorkstates.capturedAt, contextCutoff()),
        ),
      );
    if (!row) throw new NotFoundException('Workstate not found');
    return this.toWorkstate(row, await this.context.privateWords(userId));
  }

  async list(userId: string, input: unknown): Promise<WorkstatePage> {
    const query = new ZodValidationPipe(workstateQuerySchema).transform(input);
    const table = activityWorkstates;
    const rows = await this.db
      .select()
      .from(table)
      .where(
        and(
          eq(table.userId, userId),
          gte(table.capturedAt, contextCutoff()),
          query.from ? gte(table.capturedAt, new Date(query.from)) : undefined,
          query.to ? lte(table.capturedAt, new Date(query.to)) : undefined,
          query.before && query.beforeId
            ? or(
                lt(table.capturedAt, new Date(query.before)),
                and(eq(table.capturedAt, new Date(query.before)), lt(table.id, query.beforeId)),
              )
            : undefined,
        ),
      )
      .orderBy(desc(table.capturedAt), desc(table.id))
      .limit(query.limit);
    const words = await this.context.privateWords(userId);
    const items = rows
      .map((row) => this.toWorkstate(row, words))
      .filter(({ capture }) => {
        const context = [capture.activeApp, capture.projectPath, capture.gitBranch]
          .filter(Boolean)
          .join(' ');
        const text = [...Object.values(capture).flat()].filter(Boolean).join(' ');
        return (
          (!query.search || text.toLowerCase().includes(query.search.toLowerCase())) &&
          (!query.context || context.toLowerCase().includes(query.context.toLowerCase()))
        );
      });
    const last = rows.at(-1);
    return {
      items,
      nextCursor:
        last && rows.length === query.limit
          ? { before: last.capturedAt.toISOString(), beforeId: last.id }
          : null,
    };
  }

  /** Only a proposal. No process, filesystem or git operations are performed. */
  async restore(userId: string, id: string, input: unknown = {}): Promise<WorkstateRestorePlan> {
    new ZodValidationPipe(workstateRestoreRequestSchema).transform(input);
    const state = await this.get(userId, id);
    return restorePlan(state.id, state.capture);
  }

  async remove(userId: string, id: string): Promise<void> {
    const parsed = new ZodValidationPipe(workstateIdSchema).transform(id);
    await withoutTrash(this.db, async (tx) =>
      tx
        .delete(activityWorkstates)
        .where(and(eq(activityWorkstates.userId, userId), eq(activityWorkstates.id, parsed))),
    );
  }

  async clear(userId: string): Promise<void> {
    await withoutTrash(this.db, async (tx) =>
      tx.delete(activityWorkstates).where(eq(activityWorkstates.userId, userId)),
    );
  }

  async deleteOld(userId: string): Promise<void> {
    await withoutTrash(this.db, async (tx) =>
      tx
        .delete(activityWorkstates)
        .where(
          and(
            eq(activityWorkstates.userId, userId),
            lt(activityWorkstates.capturedAt, contextCutoff()),
          ),
        ),
    );
  }

  private toWorkstate(row: typeof activityWorkstates.$inferSelect, words: string[]): Workstate {
    return workstateSchema.parse({
      id: row.id,
      deviceId: row.deviceId,
      capturedAt: row.capturedAt.toISOString(),
      capture: sanitizeWorkstate(workstateCaptureSchema.parse(JSON.parse(row.capture)), words),
    });
  }
}

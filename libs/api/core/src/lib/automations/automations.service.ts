import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  AutomationActionDef,
  AutomationCatalog,
  AutomationRule,
  automationRuleInputSchema,
  AutomationRuleInput,
  AutomationTriggerDef,
  zonedDateTime,
} from '@pd/contracts';
import { and, asc, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { AiService } from '../ai/ai.service';
import { DB, Database } from '../database/database.module';
import { UsersService } from '../users/users.service';
import { fillTemplate, paramsError, parseDraft } from './automation-rules';
import { AutomationRuleRow, automationRules } from './automations.schema';

type Params = Record<string, string>;
type ValidRuleInput = z.output<typeof automationRuleInputSchema>;

/** What can happen in a module (registered in its `*.automations.ts`). */
export interface AutomationTrigger extends AutomationTriggerDef {
  /** In English, for the AI that turns a sentence into a rule. */
  description: string;
  /** Whether an event fits the rule's fields (e.g. "only this site"); all fit by default. */
  matches?(params: Params, vars: Params): boolean;
  /**
   * A trigger of time ("no diary entry by 22:00"): asked every few minutes with the user's own
   * clock; the variables when it fires. Runs at most once a day per rule.
   */
  check?(
    userId: string,
    params: Params,
    now: { date: string; time: string },
  ): Promise<Params | null>;
}

/** What a module can do for a rule. */
export interface AutomationAction extends AutomationActionDef {
  description: string;
  /** The fields come with the event's `{{variables}}` already filled in. */
  run(userId: string, params: Params, vars: Params): Promise<void>;
}

/** A rule cannot run more often than this in a day: a loop or a flood stops here. */
const MAX_RUNS_A_DAY = 20;

const DRAFT_INSTRUCTION =
  'Turn the user request into ONE automation rule of a personal dashboard. The catalog below ' +
  'lists the triggers and actions with their fields (name, type, allowed values, required). ' +
  'Answer with JSON only: {"name": short name, "trigger": id, "triggerParams": {field: value}, ' +
  '"action": id, "actionParams": {field: value}}. Use only ids, fields and option values of ' +
  'the catalog; all values are strings; times are HH:MM; texts are in the language of the ' +
  'request and may use the {{variables}} of the trigger. Leave out optional fields you do not ' +
  'need. If the catalog cannot do it, answer {"error": "a short reason"}.';

/**
 * Rules "if X, then Y" across the modules. Modules register triggers and actions; an event
 * (`emit`) or the clock (`checkTime`) runs the matching rules of the user. Modules never call
 * each other: the core joins them.
 */
@Injectable()
export class AutomationsService {
  private readonly logger = new Logger(AutomationsService.name);
  private readonly triggers = new Map<string, AutomationTrigger>();
  private readonly actions = new Map<string, AutomationAction>();

  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly users: UsersService,
    private readonly ai: AiService,
  ) {}

  registerTrigger(trigger: AutomationTrigger): void {
    this.triggers.set(trigger.id, trigger);
  }

  registerAction(action: AutomationAction): void {
    this.actions.set(action.id, action);
  }

  catalog(): AutomationCatalog {
    return {
      triggers: [...this.triggers.values()].map(({ id, module, labelKey, params, variables }) => ({
        id,
        module,
        labelKey,
        params,
        variables,
      })),
      actions: [...this.actions.values()].map(({ id, module, labelKey, params }) => ({
        id,
        module,
        labelKey,
        params,
      })),
    };
  }

  async list(userId: string): Promise<AutomationRule[]> {
    const rows = await this.db
      .select()
      .from(automationRules)
      .where(eq(automationRules.userId, userId))
      .orderBy(asc(automationRules.createdAt));
    return rows.map(toRule);
  }

  async create(userId: string, input: ValidRuleInput): Promise<AutomationRule> {
    this.validate(input);
    const [row] = await this.db
      .insert(automationRules)
      .values({ userId, ...input })
      .returning();
    return toRule(row);
  }

  async update(userId: string, id: string, input: ValidRuleInput): Promise<AutomationRule> {
    this.validate(input);
    const [row] = await this.db
      .update(automationRules)
      .set({ ...input, lastError: null })
      .where(and(eq(automationRules.id, id), eq(automationRules.userId, userId)))
      .returning();
    if (!row) {
      throw new NotFoundException();
    }
    return toRule(row);
  }

  async remove(userId: string, id: string): Promise<void> {
    await this.db
      .delete(automationRules)
      .where(and(eq(automationRules.id, id), eq(automationRules.userId, userId)));
  }

  /** Something happened in a module: the user's rules on it run. Never throws. */
  async emit(userId: string, triggerId: string, vars: Params): Promise<void> {
    const trigger = this.triggers.get(triggerId);
    if (!trigger) {
      return;
    }
    try {
      const rules = await this.activeRules(userId, [triggerId]);
      for (const rule of rules) {
        if (!trigger.matches || trigger.matches(rule.triggerParams, vars)) {
          await this.runRule(rule, vars, false);
        }
      }
    } catch (error) {
      this.logger.warn(`Automations on ${triggerId} failed: ${(error as Error).message}`);
    }
  }

  /** The triggers of time, for every user: run by AutomationsJob every few minutes. */
  async checkTime(): Promise<void> {
    const timed = [...this.triggers.values()].filter((trigger) => trigger.check);
    if (!timed.length) {
      return;
    }
    const rules = await this.db
      .select()
      .from(automationRules)
      .where(
        and(
          eq(automationRules.isActive, true),
          inArray(
            automationRules.trigger,
            timed.map((trigger) => trigger.id),
          ),
        ),
      );
    for (const rule of rules) {
      const now = await this.now(rule.userId);
      if (rule.lastFiredOn === now.date) {
        continue;
      }
      try {
        const vars = await this.triggers
          .get(rule.trigger)
          ?.check?.(rule.userId, rule.triggerParams, now);
        if (vars) {
          await this.runRule(rule, vars, true);
        }
      } catch (error) {
        await this.failed(rule, error);
      }
    }
  }

  /** "If a site goes down, make a task" → a rule to check and save (not saved here). */
  async draft(userId: string, text: string): Promise<AutomationRuleInput> {
    if (!(await this.ai.isConfigured(userId))) {
      throw new BadRequestException('AI is not configured');
    }
    const catalog = {
      triggers: [...this.triggers.values()].map(({ id, description, params, variables }) => ({
        id,
        description,
        params: params.map(describeParam),
        variables,
      })),
      actions: [...this.actions.values()].map(({ id, description, params }) => ({
        id,
        description,
        params: params.map(describeParam),
      })),
    };
    const reply = await this.ai.complete(
      userId,
      DRAFT_INSTRUCTION,
      `Catalog: ${JSON.stringify(catalog)}\n\nRequest: ${text}`,
    );
    const result = parseDraft(reply, this.catalog());
    if ('error' in result) {
      throw new UnprocessableEntityException(result.error);
    }
    return result.draft;
  }

  private async runRule(rule: AutomationRuleRow, vars: Params, timed: boolean): Promise<void> {
    const action = this.actions.get(rule.action);
    if (!action) {
      return;
    }
    const today = (await this.now(rule.userId)).date;
    const runsToday = rule.lastFiredOn === today ? rule.firedThatDay : 0;
    if (runsToday >= (timed ? 1 : MAX_RUNS_A_DAY)) {
      return;
    }
    // `{{rule}}` — the rule's own name, for a message title.
    const filled = { ...vars, rule: rule.name };
    const params = Object.fromEntries(
      Object.entries(rule.actionParams).map(([name, value]) => [name, fillTemplate(value, filled)]),
    );
    try {
      await action.run(rule.userId, params, filled);
      await this.db
        .update(automationRules)
        .set({
          fireCount: rule.fireCount + 1,
          lastFiredAt: new Date(),
          lastFiredOn: today,
          firedThatDay: runsToday + 1,
          lastError: null,
        })
        .where(eq(automationRules.id, rule.id));
    } catch (error) {
      await this.failed(rule, error);
    }
  }

  private async failed(rule: AutomationRuleRow, error: unknown): Promise<void> {
    const message = (error as Error).message ?? String(error);
    this.logger.warn(`Automation "${rule.name}" failed: ${message}`);
    await this.db
      .update(automationRules)
      .set({ lastError: message.slice(0, 500) })
      .where(eq(automationRules.id, rule.id));
  }

  private activeRules(userId: string, triggers: string[]) {
    return this.db
      .select()
      .from(automationRules)
      .where(
        and(
          eq(automationRules.userId, userId),
          eq(automationRules.isActive, true),
          inArray(automationRules.trigger, triggers),
        ),
      );
  }

  private async now(userId: string): Promise<{ date: string; time: string }> {
    const user = await this.users.findById(userId);
    return zonedDateTime(new Date(), this.users.timeZoneOf(user));
  }

  private validate(input: ValidRuleInput): void {
    const trigger = this.triggers.get(input.trigger);
    const action = this.actions.get(input.action);
    if (!trigger || !action) {
      throw new BadRequestException('Unknown trigger or action');
    }
    const problem =
      paramsError(trigger.params, input.triggerParams) ??
      paramsError(action.params, input.actionParams);
    if (problem) {
      throw new BadRequestException(problem);
    }
  }
}

function describeParam(param: AutomationTriggerDef['params'][number]) {
  return {
    name: param.name,
    type: param.type,
    required: param.required ?? false,
    ...(param.options ? { values: param.options.map((option) => option.value) } : {}),
  };
}

function toRule(row: AutomationRuleRow): AutomationRule {
  return {
    id: row.id,
    name: row.name,
    trigger: row.trigger,
    triggerParams: row.triggerParams,
    action: row.action,
    actionParams: row.actionParams,
    isActive: row.isActive,
    fireCount: row.fireCount,
    lastFiredAt: row.lastFiredAt?.toISOString() ?? null,
    lastError: row.lastError,
  };
}

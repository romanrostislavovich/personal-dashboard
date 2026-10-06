import { z } from 'zod';

// Rules "if X, then Y" across the modules: a module tells the core what can happen in it
// (a trigger) and what it can do (an action); the user joins them into rules.
// Labels are translation keys of the modules: the server knows no language for them.

export const AUTOMATION_PARAM_TYPES = ['text', 'number', 'time', 'select'] as const;
export type AutomationParamType = (typeof AUTOMATION_PARAM_TYPES)[number];

/** A field of a trigger or an action. */
export interface AutomationParamDef {
  name: string;
  type: AutomationParamType;
  labelKey: string;
  /** For `select`: the values with their translation keys. */
  options?: { value: string; labelKey: string }[];
  required?: boolean;
  /** For `text`: `{{site}}`-style placeholders filled from the event are allowed. */
  template?: boolean;
}

export interface AutomationTriggerDef {
  /** `<module>.<what>`, e.g. `monitoring.down`. */
  id: string;
  module: string;
  labelKey: string;
  params: AutomationParamDef[];
  /** What an action's text may use: `{{site}}`, `{{amount}}`… */
  variables: string[];
}

export interface AutomationActionDef {
  id: string;
  module: string;
  labelKey: string;
  params: AutomationParamDef[];
}

/** What rules can be made of, as the modules registered it. */
export interface AutomationCatalog {
  triggers: AutomationTriggerDef[];
  actions: AutomationActionDef[];
}

const params = z.record(z.string().max(50), z.string().max(1000));

export const automationRuleInputSchema = z.object({
  name: z.string().trim().min(1).max(100),
  trigger: z.string().trim().min(1).max(100),
  triggerParams: params.default({}),
  action: z.string().trim().min(1).max(100),
  actionParams: params.default({}),
  isActive: z.boolean().default(true),
});
export type AutomationRuleInput = z.input<typeof automationRuleInputSchema>;

export interface AutomationRule {
  id: string;
  name: string;
  trigger: string;
  triggerParams: Record<string, string>;
  action: string;
  actionParams: Record<string, string>;
  isActive: boolean;
  fireCount: number;
  lastFiredAt: string | null;
  /** Why the last run failed; `null` — it went well. */
  lastError: string | null;
}

/** "If a site goes down, make a task": the AI fills in a rule to check and save. */
export const automationDraftRequestSchema = z.object({ text: z.string().trim().min(5).max(500) });
export type AutomationDraftRequest = z.infer<typeof automationDraftRequestSchema>;

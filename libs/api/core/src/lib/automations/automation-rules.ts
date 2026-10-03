import { AutomationCatalog, AutomationParamDef, AutomationRuleInput } from '@pd/contracts';

/** `{{site}} is down` → `ai-text-guard.com is down`; an unknown placeholder stays as it is. */
export function fillTemplate(text: string, vars: Record<string, string>): string {
  return text.replace(/\{\{\s*(\w+)\s*\}\}/g, (match, name: string) => vars[name] ?? match);
}

/** What is wrong with the params of a trigger or an action; `null` — nothing. */
export function paramsError(
  defs: AutomationParamDef[],
  params: Record<string, string>,
): string | null {
  for (const def of defs) {
    const value = (params[def.name] ?? '').trim();
    if (!value) {
      if (def.required) {
        return `"${def.name}" is required`;
      }
      continue;
    }
    if (def.type === 'number' && !Number.isFinite(Number(value))) {
      return `"${def.name}" must be a number`;
    }
    if (def.type === 'time' && !/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) {
      return `"${def.name}" must be a time HH:MM`;
    }
    if (def.type === 'select' && !def.options?.some((option) => option.value === value)) {
      return `"${def.name}" must be one of ${def.options?.map((o) => o.value).join(', ')}`;
    }
  }
  const unknown = Object.keys(params).find((name) => !defs.some((def) => def.name === name));
  return unknown ? `"${unknown}" is not a field here` : null;
}

/**
 * The AI's answer to "make me a rule" as a rule to check: its JSON (in a code block or not)
 * with a trigger and an action of the catalog. An error — a sentence the AI wrote, or why the
 * answer does not fit.
 */
export function parseDraft(
  reply: string,
  catalog: AutomationCatalog,
): { draft: AutomationRuleInput } | { error: string } {
  const json = reply.match(/\{[\s\S]*\}/)?.[0];
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(json ?? '');
  } catch {
    return { error: reply.trim().slice(0, 300) || 'The AI gave no rule' };
  }
  if (typeof data['error'] === 'string') {
    return { error: data['error'] };
  }
  const trigger = catalog.triggers.find((t) => t.id === data['trigger']);
  const action = catalog.actions.find((a) => a.id === data['action']);
  if (!trigger || !action) {
    return { error: 'The AI picked an event or an action that does not exist' };
  }
  const triggerParams = strings(data['triggerParams']);
  const actionParams = strings(data['actionParams']);
  const problem =
    paramsError(trigger.params, triggerParams) ?? paramsError(action.params, actionParams);
  if (problem) {
    return { error: problem };
  }
  return {
    draft: {
      name:
        typeof data['name'] === 'string' && data['name'].trim()
          ? data['name'].trim().slice(0, 100)
          : trigger.id,
      trigger: trigger.id,
      triggerParams,
      action: action.id,
      actionParams,
      isActive: true,
    },
  };
}

/** Params as strings: the AI may answer `"amount": 100`. */
function strings(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object') {
    return {};
  }
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== null && item !== undefined && item !== '')
      .map(([key, item]) => [key, String(item)]),
  );
}

import { AutomationCatalog } from '@pd/contracts';
import { fillTemplate, paramsError, parseDraft } from './automation-rules';

const catalog: AutomationCatalog = {
  triggers: [
    {
      id: 'monitoring.down',
      module: 'monitoring',
      labelKey: 'monitoring.automations.down',
      params: [{ name: 'site', type: 'text', labelKey: 'x' }],
      variables: ['site', 'error'],
    },
    {
      id: 'core.daily',
      module: 'core',
      labelKey: 'core.automations.daily',
      params: [{ name: 'time', type: 'time', labelKey: 'x', required: true }],
      variables: [],
    },
  ],
  actions: [
    {
      id: 'tasks.create',
      module: 'tasks',
      labelKey: 'tasks.automations.create',
      params: [
        { name: 'title', type: 'text', labelKey: 'x', required: true, template: true },
        {
          name: 'due',
          type: 'select',
          labelKey: 'x',
          options: [
            { value: 'none', labelKey: 'x' },
            { value: 'today', labelKey: 'x' },
          ],
        },
      ],
    },
  ],
};

describe('fillTemplate', () => {
  it('fills the placeholders it knows and keeps the rest', () => {
    expect(
      fillTemplate('{{site}} is down: {{ error }} {{other}}', { site: 'a.com', error: '502' }),
    ).toBe('a.com is down: 502 {{other}}');
  });
});

describe('paramsError', () => {
  const [, daily] = catalog.triggers;
  const [task] = catalog.actions;

  it('checks required fields, times, numbers and choices', () => {
    expect(paramsError(daily.params, {})).toMatch(/required/);
    expect(paramsError(daily.params, { time: '25:00' })).toMatch(/HH:MM/);
    expect(paramsError(daily.params, { time: '07:30' })).toBeNull();
    expect(paramsError(task.params, { title: 'Fix it', due: 'someday' })).toMatch(/one of/);
    expect(paramsError(task.params, { title: 'Fix it', color: 'red' })).toMatch(/not a field/);
  });
});

describe('parseDraft', () => {
  it('reads a rule from a code block, numbers as strings', () => {
    const reply =
      'Here it is:\n```json\n{"name":"Site down → task","trigger":"monitoring.down",' +
      '"triggerParams":{},"action":"tasks.create","actionParams":{"title":"Fix {{site}}","due":"today"}}\n```';
    expect(parseDraft(reply, catalog)).toEqual({
      draft: {
        name: 'Site down → task',
        trigger: 'monitoring.down',
        triggerParams: {},
        action: 'tasks.create',
        actionParams: { title: 'Fix {{site}}', due: 'today' },
        isActive: true,
      },
    });
  });

  it('passes on what the AI could not do and rejects unknown ids', () => {
    expect(parseDraft('{"error":"There is no weather trigger"}', catalog)).toEqual({
      error: 'There is no weather trigger',
    });
    expect(parseDraft('{"trigger":"weather.rain","action":"tasks.create"}', catalog)).toEqual({
      error: expect.stringMatching(/does not exist/),
    });
    expect(parseDraft('Sorry, I cannot.', catalog)).toEqual({ error: 'Sorry, I cannot.' });
  });
});

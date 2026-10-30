import {BadRequestException} from '@nestjs/common';
import {AiService, LifeService, LinksService} from '@pd/api-core';
import {readFileSync} from 'node:fs';
import {ActivityAiTools} from './activity.ai-tools';
import {ActivityLife} from './activity.life';
import {ActivityLinks} from './activity.links';
import {ActivityService} from './activity.service';
import {TelemetrySummaryMetric} from './telemetry-summary';
import {TelemetrySummaryService} from './telemetry-summary.service';
import {TELEMETRY_TOTALS, TELEMETRY_RATES} from './telemetry-summary';

const period = {from: '2025-03-29', to: '2025-03-31'};
const metrics: TelemetrySummaryMetric[] = [
  {
    source: 'browser',
    name: 'readingHours',
    unit: 'hours',
    value: 0.5,
    days: [
      {day: '2025-03-29', value: 0.5},
      {day: '2025-03-31', value: 0},
    ],
  },
];

describe('activity telemetry registration', () => {
  it('registers an owner-scoped Links source independent of legacy tracker activity', async () => {
    const registerDailyMetrics = vi.fn<LinksService['registerDailyMetrics']>();
    const links = {
      registerDailyMetrics,
      registerProject: vi.fn(),
      registerTimeSpent: vi.fn(),
      registerMoments: vi.fn(),
      registerUsage: vi.fn(),
      registerPages: vi.fn(),
    };
    const summarize = vi.fn().mockResolvedValue(metrics);
    new ActivityLinks(
      {} as never,
      links as unknown as LinksService,
      {} as never,
      {} as never,
      {summarize} as unknown as TelemetrySummaryService,
      {} as never,
    ).onModuleInit();
    const source = registerDailyMetrics.mock.calls[0][0];
    expect(source.module).toBe('activity');
    const result = await source.metrics('owner', period);
    expect(summarize).toHaveBeenCalledWith('owner', period);
    expect(result).toEqual([
      {
        key: 'activity.telemetry.browser.readingHours',
        labelKey: 'activity.telemetry.browser.readingHours',
        module: 'activity',
        unit: 'hours',
        missing: 'absent',
        days: metrics[0].days,
      },
    ]);
    const core = new LinksService();
    core.registerDailyMetrics(source);
    expect(await core.dailyMetric('owner', result[0].key, period)).toEqual(
      result[0],
    );
  });

  it('emits day events and weighted period cards even without legacy tracking', async () => {
    const life = new LifeService();
    const summarize = vi.fn().mockResolvedValue(metrics);
    const activity = {stats: vi.fn().mockResolvedValue({totalSeconds: 0})};
    new ActivityLife(
      life,
      activity as unknown as ActivityService,
      {} as never,
      {summarize} as unknown as TelemetrySummaryService,
    ).onModuleInit();
    const day = await life.day('owner', period.from);
    expect(day.events).toEqual([
      {
        module: 'activity',
        icon: 'analytics',
        key: 'activity.telemetry.browser.readingHoursDay',
        params: {value: 0.5},
        at: null,
        link: '/activity/overview',
      },
    ]);
    expect(summarize).toHaveBeenCalledWith('owner', {
      from: period.from,
      to: period.from,
    });
    expect(await life.period('owner', period)).toEqual([
      {
        module: 'activity',
        icon: 'analytics',
        key: 'activity.telemetry.browser.readingHours',
        value: 0.5,
        format: 'hours',
        aggregate: 'sum',
        detailKey: 'activity.telemetry.observations',
      },
    ]);
    expect(await life.day('owner', period.from, ['activity'])).toEqual({
      day: period.from,
      events: [],
    });
  });

  it('registers recall and telemetry tools as read-only, bounds search, and strips full context', async () => {
    const registerTool = vi.fn<AiService['registerTool']>();
    const nextCursor = {
      before: '2025-03-29T12:00:00Z',
      beforeId: '0d593c49-2b03-48dc-9795-c858b20619eb',
    };
    const list = vi.fn().mockResolvedValue({
      items: [
        {
          id: nextCursor.beforeId,
          capturedAt: nextCursor.before,
          deviceId: 'device',
          capture: {
            activeApp: 'WebStorm',
            note: 'Resume tests',
            projectPath: '/private/project',
            gitBranch: 'feature/private',
            windowTitle: 'Private title',
            browserUrls: ['https://example.com/docs'],
          },
        },
      ],
      nextCursor,
    });
    const restore = vi.fn();
    const summarize = vi.fn().mockResolvedValue(metrics);
    new ActivityAiTools(
      {registerTool} as unknown as AiService,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {list, restore} as never,
      {summarize} as never,
      {} as never,
    ).onModuleInit();
    const recall = registerTool.mock.calls
      .map(([tool]) => tool)
      .find(tool => tool.name === 'activity_workstate_recall');
    const summary = registerTool.mock.calls
      .map(([tool]) => tool)
      .find(tool => tool.name === 'activity_telemetry_summary');
    expect(recall?.writes).not.toBe(true);
    expect(summary?.writes).not.toBe(true);
    expect(
      await recall?.handler('owner', {context: 'project', limit: 10}),
    ).toEqual({
      items: [
        {
          id: nextCursor.beforeId,
          capturedAt: nextCursor.before,
          activeApp: 'WebStorm',
          note: 'Resume tests',
        },
      ],
      nextCursor,
    });
    expect(list).toHaveBeenCalledWith('owner', {context: 'project', limit: 10});
    await expect(recall?.handler('owner', {limit: 101})).rejects.toThrow();
    await expect(recall?.handler('owner', {userId: 'other'})).rejects.toThrow();
    expect(list).toHaveBeenCalledTimes(1);
    list.mockResolvedValue({items: [], nextCursor});
    expect(await recall?.handler('owner', {...nextCursor, limit: 10})).toEqual({
      items: [],
      nextCursor,
    });
    expect(restore).not.toHaveBeenCalled();
    expect(await summary?.handler('owner', period)).toEqual(metrics);
    expect(summarize).toHaveBeenCalledWith('owner', period);
  });

  it.each([
    {from: '2025-02-30', to: '2025-03-01'},
    {from: '2025-03-31', to: '2025-03-01'},
    {from: '2000-01-01', to: '2025-01-01'},
  ])(
    'rejects invalid summary periods before accessing the database: %j',
    async input => {
      const service = new TelemetrySummaryService({} as never, {} as never);
      await expect(service.summarize('owner', input)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    },
  );

  it('provides matching translations for all metric and event keys', () => {
    const read = (language: string) =>
      JSON.parse(
        readFileSync(
          new URL(
            `../../../web/src/lib/i18n/${language}.json`,
            import.meta.url,
          ),
          'utf8',
        ),
      ).telemetry;
    const en = read('en');
    const ru = read('ru');
    expect(Object.keys(en).sort()).toEqual(Object.keys(ru).sort());
    for (const source of ['desktop', 'browser']) {
      expect(Object.keys(en[source]).sort()).toEqual(
        Object.keys(ru[source]).sort(),
      );
      for (const name of Object.keys({
        ...TELEMETRY_TOTALS,
        ...TELEMETRY_RATES,
      })) {
        expect(en[source][name]).toBeTruthy();
        expect(ru[source][name]).toBeTruthy();
        expect(en[source][`${name}Day`]).toContain('{{value}}');
        expect(ru[source][`${name}Day`]).toContain('{{value}}');
      }
    }
  });
});

import { TelemetryMetrics } from '@pd/contracts';
import { telemetryDays, TelemetryReading, TelemetrySummary } from './telemetry-summary';
import {
  telemetryDailyMetrics,
  telemetryLifeCards,
  telemetryLifeEvents,
} from './telemetry-summary.views';

function row(
  start: string,
  end: string,
  metrics: TelemetryMetrics,
  source: TelemetryReading['source'] = 'desktop',
): TelemetryReading {
  return { startedAt: new Date(start), endedAt: new Date(end), metrics, source };
}

function summarize(
  rows: TelemetryReading[],
  from = '2025-03-29',
  to = '2025-03-31',
  zone = 'Europe/Warsaw',
) {
  const summary = new TelemetrySummary(telemetryDays({ from, to }, zone));
  rows.forEach((value) => summary.add(value));
  return summary.result();
}

describe('telemetry summary measurements', () => {
  it.each([
    ['America/Santiago', '2025-09-07', '2025-09-07T04:00:00.000Z', 23],
    ['America/Havana', '2025-11-02', '2025-11-02T04:00:00.000Z', 25],
  ])(
    'finds the first actual instant of a local day when midnight is skipped or repeated in %s',
    (zone, day, start, hours) => {
      const [range] = telemetryDays({ from: day, to: day }, zone);
      expect(new Date(range.start).toISOString()).toBe(start);
      expect((range.end - range.start) / 3_600_000).toBe(hours);
      const crossing = row(
        new Date(range.start - 60_000).toISOString(),
        new Date(range.start + 60_000).toISOString(),
        { inputCount: 10 },
      );
      expect(
        summarize([crossing], day, day, zone).find((metric) => metric.name === 'inputCount')?.value,
      ).toBe(5);
    },
  );

  it('keeps missing fields and days absent, including between observed zeros', () => {
    const metrics = summarize([
      row('2025-03-29T12:00:00Z', '2025-03-29T12:01:00Z', { contextSwitches: 0 }),
      row('2025-03-30T12:00:00Z', '2025-03-30T12:01:00Z', {}),
      row('2025-03-31T12:00:00Z', '2025-03-31T12:01:00Z', { contextSwitches: 0 }),
    ]);
    expect(metrics).toHaveLength(1);
    expect(metrics[0].days).toEqual([
      { day: '2025-03-29', value: 0 },
      { day: '2025-03-31', value: 0 },
    ]);
    expect(telemetryDailyMetrics(metrics)[0]).toMatchObject({ unit: 'count', missing: 'absent' });
    expect(summarize([])).toEqual([]);
    expect(telemetryLifeCards([])).toEqual([]);
    expect(telemetryLifeEvents([])).toEqual([]);
  });

  it('splits a bucket across local midnight and clips exclusive period boundaries', () => {
    const sample = row('2025-03-29T22:59:00Z', '2025-03-29T23:01:00Z', {
      inputCount: 11,
      focusSeconds: 120,
    });
    const metrics = summarize([sample]);
    const inputs = metrics.find((metric) => metric.name === 'inputCount');
    expect(inputs?.days).toEqual([
      { day: '2025-03-29', value: 5.5 },
      { day: '2025-03-30', value: 5.5 },
    ]);
    expect(inputs?.value).toBe(11);
    const first = summarize([sample], '2025-03-29', '2025-03-29');
    const second = summarize([sample], '2025-03-30', '2025-03-30');
    expect(
      [...first, ...second]
        .filter((metric) => metric.name === 'focusHours')
        .reduce((sum, metric) => sum + metric.value, 0),
    ).toBeCloseTo(120 / 3600);
    expect(
      summarize(
        [row('2025-03-29T22:59:00Z', '2025-03-29T23:00:00Z', { inputCount: 1 })],
        '2025-03-30',
        '2025-03-30',
      ),
    ).toEqual([]);
  });

  it.each([
    ['2025-03-30', '2025-03-30T00:59:00Z', '2025-03-30T01:01:00Z', 23],
    ['2025-10-26', '2025-10-26T00:59:00Z', '2025-10-26T01:01:00Z', 25],
  ])(
    'uses actual elapsed time through DST on %s without counting a bucket twice',
    (day, start, end, hours) => {
      const [range] = telemetryDays({ from: day, to: day }, 'Europe/Warsaw');
      expect((range.end - range.start) / 3_600_000).toBe(hours);
      const result = summarize([row(start, end, { focusSeconds: 120, inputCount: 60 })], day, day);
      expect(result.find((metric) => metric.name === 'focusHours')?.value).toBeCloseTo(120 / 3600);
      expect(result.find((metric) => metric.name === 'inputPerMinute')?.value).toBe(30);
      expect(result.every((metric) => metric.days.length === 1)).toBe(true);
    },
  );

  it('uses the configured timezone, including fractional UTC offsets', () => {
    const result = summarize(
      [row('2025-03-29T18:14:00Z', '2025-03-29T18:16:00Z', { readingSeconds: 120 }, 'browser')],
      '2025-03-29',
      '2025-03-30',
      'Asia/Kathmandu',
    );
    expect(result[0].days.map((day) => day.day)).toEqual(['2025-03-29', '2025-03-30']);
    expect(result[0].days.map((day) => day.value)).toEqual([1 / 60, 1 / 60]);
  });

  it('weights input rate by measured duration and error rate by paired commands, not daily averages', () => {
    const result = summarize([
      row('2025-03-29T12:00:00Z', '2025-03-29T12:01:00Z', {
        inputCount: 60,
        backspaceCount: 6,
        terminalCommands: 10,
        terminalFailures: 5,
      }),
      row('2025-03-30T12:00:00Z', '2025-03-30T12:04:00Z', {
        inputCount: 60,
        backspaceCount: 0,
        terminalCommands: 90,
        terminalFailures: 0,
      }),
      row('2025-03-30T13:00:00Z', '2025-03-30T13:05:00Z', { terminalCommands: 900 }),
      row('2025-03-30T14:00:00Z', '2025-03-30T14:05:00Z', {}),
    ]);
    expect(result.find((metric) => metric.name === 'inputPerMinute')?.value).toBe(24);
    expect(result.find((metric) => metric.name === 'terminalErrorPercent')?.value).toBe(5);
    expect(result.find((metric) => metric.name === 'backspacePercent')?.value).toBe(5);
    expect(result.find((metric) => metric.name === 'terminalCommands')?.value).toBe(1000);
    expect(
      telemetryLifeCards(result).find((metric) => metric.key.endsWith('.terminalErrorPercent')),
    ).toMatchObject({ value: 5, aggregate: 'average' });
  });

  it('does not invent a rate for zero denominators or unpaired observations', () => {
    const result = summarize([
      row('2025-03-29T12:00:00Z', '2025-03-29T12:01:00Z', {
        terminalCommands: 0,
        terminalFailures: 0,
        inputCount: 0,
        backspaceCount: 0,
      }),
      row('2025-03-29T13:00:00Z', '2025-03-29T13:01:00Z', { terminalCommands: 5 }),
    ]);
    expect(
      result.some(
        (metric) => metric.name === 'terminalErrorPercent' || metric.name === 'backspacePercent',
      ),
    ).toBe(false);
    expect(result.find((metric) => metric.name === 'inputPerMinute')?.value).toBe(0);
  });

  it('keeps browser and desktop distinct, totals time, and emits only numeric summaries', () => {
    const sample = row('2025-03-29T12:00:00Z', '2025-03-29T12:01:00Z', {
      readingSeconds: 30,
      buildWaitMs: 1000,
    });
    const result = summarize([
      { ...sample, page: { url: 'https://example.com/private' } } as TelemetryReading,
      { ...sample, source: 'browser' },
    ]);
    expect(result).toHaveLength(4);
    expect(telemetryLifeEvents(result).every((event) => Number(event.params?.['value']) > 0)).toBe(
      true,
    );
    expect(
      result
        .filter((metric) => metric.name === 'buildWaitHours')
        .every((metric) => metric.value === 1 / 3600),
    ).toBe(true);
    expect(
      JSON.stringify([
        result,
        telemetryLifeCards(result),
        telemetryLifeEvents(result),
        telemetryDailyMetrics(result),
      ]),
    ).not.toContain('example.com');
  });
});

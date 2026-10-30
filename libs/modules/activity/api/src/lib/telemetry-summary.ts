import {
  ActivityPeriod,
  addDays,
  DailyMetric,
  LocalDate,
  parseLocalDate,
  TelemetryMetrics,
  toLocalDate,
} from '@pd/contracts';

export interface TelemetryReading {
  source: 'desktop' | 'browser';
  startedAt: Date;
  endedAt: Date;
  metrics: TelemetryMetrics;
}

export const TELEMETRY_TOTALS = {
  contextSwitches: {field: 'contextSwitches', scale: 1, unit: 'count'},
  focusHours: {field: 'focusSeconds', scale: 1 / 3600, unit: 'hours'},
  inputCount: {field: 'inputCount', scale: 1, unit: 'count'},
  terminalCommands: {field: 'terminalCommands', scale: 1, unit: 'count'},
  terminalFailures: {field: 'terminalFailures', scale: 1, unit: 'count'},
  buildWaitHours: {field: 'buildWaitMs', scale: 1 / 3_600_000, unit: 'hours'},
  readingHours: {field: 'readingSeconds', scale: 1 / 3600, unit: 'hours'},
} as const;

export const TELEMETRY_RATES = {
  inputPerMinute: {
    numerator: 'inputCount',
    denominator: null,
    scale: 60_000,
    unit: 'score',
  },
  terminalErrorPercent: {
    numerator: 'terminalFailures',
    denominator: 'terminalCommands',
    scale: 100,
    unit: 'percent',
  },
  backspacePercent: {
    numerator: 'backspaceCount',
    denominator: 'inputCount',
    scale: 100,
    unit: 'percent',
  },
} as const;

export type TelemetryMetricName =
  keyof typeof TELEMETRY_TOTALS | keyof typeof TELEMETRY_RATES;
export interface TelemetrySummaryMetric {
  source: TelemetryReading['source'];
  name: TelemetryMetricName;
  unit: DailyMetric['unit'];
  value: number;
  days: {day: LocalDate; value: number}[];
}

interface Measurement {
  numerator: number;
  denominator: number;
}

export function telemetryDays(period: ActivityPeriod, timeZone: string) {
  const calendar = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const days: {day: LocalDate; start: number; end: number}[] = [];
  let start = startOfDay(period.from, calendar);
  for (let day = period.from; day <= period.to;) {
    const next = toLocalDate(addDays(parseLocalDate(day), 1));
    const end = startOfDay(next, calendar);
    days.push({day, start, end});
    start = end;
    day = next;
  }
  return days;
}

/** Find the first instant of the date, including a skipped or repeated local midnight. */
function startOfDay(day: LocalDate, calendar: Intl.DateTimeFormat): number {
  const utc = Date.parse(`${day}T00:00:00Z`);
  let left = utc - 36 * 3_600_000;
  let right = utc + 36 * 3_600_000;
  while (right - left > 1) {
    const middle = Math.floor((left + right) / 2);
    if (calendar.format(middle) < day) left = middle;
    else right = middle;
  }
  return right;
}

/** Buckets lack event timestamps: allocate totals proportionally to real elapsed time.
 * Sources remain separate; overlapping devices are observations, not unique wall-clock time.
 */
export class TelemetrySummary {
  private readonly values = new Map<
    string,
    {
      source: TelemetryReading['source'];
      name: TelemetryMetricName;
      days: Map<LocalDate, Measurement>;
    }
  >();

  constructor(private readonly days: ReturnType<typeof telemetryDays>) {}

  add(row: TelemetryReading): void {
    const duration = row.endedAt.getTime() - row.startedAt.getTime();
    if (duration <= 0) return;
    for (const day of this.days) {
      const overlap =
        Math.min(day.end, row.endedAt.getTime()) -
        Math.max(day.start, row.startedAt.getTime());
      if (overlap <= 0) continue;
      const fraction = overlap / duration;
      for (const [name, definition] of Object.entries(TELEMETRY_TOTALS)) {
        const value = row.metrics[definition.field];
        if (value !== undefined) {
          this.addValue(
            row.source,
            name as TelemetryMetricName,
            day.day,
            value * fraction,
            0,
          );
        }
      }
      for (const [name, definition] of Object.entries(TELEMETRY_RATES)) {
        const numerator = row.metrics[definition.numerator];
        const denominator =
          definition.denominator === null
            ? duration
            : row.metrics[definition.denominator];
        // Only paired observations contribute to a ratio. Missing failures are not successes.
        if (
          numerator !== undefined &&
          denominator !== undefined &&
          denominator > 0
        ) {
          this.addValue(
            row.source,
            name as TelemetryMetricName,
            day.day,
            numerator * fraction,
            denominator * fraction,
          );
        }
      }
    }
  }

  result(): TelemetrySummaryMetric[] {
    return [...this.values.values()]
      .map(({source, name, days}) => {
        const total = [...days.values()].reduce(
          (sum, value) => ({
            numerator: sum.numerator + value.numerator,
            denominator: sum.denominator + value.denominator,
          }),
          {numerator: 0, denominator: 0},
        );
        const definition = {...TELEMETRY_TOTALS, ...TELEMETRY_RATES}[name];
        const valueOf = (value: Measurement) =>
          (definition.scale * value.numerator) /
          (name in TELEMETRY_RATES ? value.denominator : 1);
        return {
          source,
          name,
          unit: definition.unit,
          value: valueOf(total),
          days: [...days]
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([day, value]) => ({day, value: valueOf(value)})),
        };
      })
      .sort((a, b) =>
        `${a.source}.${a.name}`.localeCompare(`${b.source}.${b.name}`),
      );
  }

  private addValue(
    source: TelemetryReading['source'],
    name: TelemetryMetricName,
    day: LocalDate,
    numerator: number,
    denominator: number,
  ): void {
    const key = `${source}.${name}`;
    let metric = this.values.get(key);
    if (!metric) {
      metric = {source, name, days: new Map()};
      this.values.set(key, metric);
    }
    const previous = metric.days.get(day) ?? {numerator: 0, denominator: 0};
    metric.days.set(day, {
      numerator: previous.numerator + numerator,
      denominator: previous.denominator + denominator,
    });
  }
}

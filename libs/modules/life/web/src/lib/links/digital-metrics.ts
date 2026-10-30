const SOURCES = ['desktop', 'browser'] as const;
const METRICS = [
  'contextSwitches',
  'inputCount',
  'terminalCommands',
  'terminalFailures',
  'focusHours',
  'buildWaitHours',
  'readingHours',
  'inputPerMinute',
  'terminalErrorPercent',
  'backspacePercent',
] as const;

export const DIGITAL_METRIC_KEYS = SOURCES.flatMap(source =>
  METRICS.map(metric => `activity.telemetry.${source}.${metric}`),
);

export function isDigitalMetric(key: string): boolean {
  return DIGITAL_METRIC_KEYS.includes(key);
}
